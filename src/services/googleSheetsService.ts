/**
 * Service para integração com Google Sheets API
 * Requer configuração OAuth 2.0 do Google
 */

import { google } from 'googleapis';
import { pgPool } from '../config/databases';
import axios from 'axios';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

export interface GoogleTokens {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  scope?: string;
  token_type?: string;
}

export interface SpreadsheetInfo {
  id: string;
  name: string;
  url: string;
}

export class GoogleSheetsService {
  private static readonly CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
  private static readonly CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
  
  private static getRedirectUri(): string {
    // Usar variável de ambiente ou construir a partir da API_URL
    if (process.env.GOOGLE_REDIRECT_URI) {
      return process.env.GOOGLE_REDIRECT_URI;
    }
    // Tentar diferentes variáveis de ambiente para URL base
    const API_URL = 
      process.env.API_URL || 
      process.env.BACKEND_URL ||
      (process.env.NODE_ENV === 'production' ? 'https://back.clerky.com.br' : 'http://localhost:4331');
    return `${API_URL}/api/google/auth/callback`;
  }

  /**
   * Obter URL de autenticação OAuth
   */
  static async getAuthUrl(userId: string, nodeId: string, workflowId: string): Promise<string> {
    // Validar se as credenciais estão configuradas
    if (!this.CLIENT_ID || this.CLIENT_ID === '') {
      throw new Error('GOOGLE_CLIENT_ID não configurado. Por favor, configure a variável de ambiente GOOGLE_CLIENT_ID no arquivo .env do backend.');
    }

    if (!this.CLIENT_SECRET || this.CLIENT_SECRET === '') {
      throw new Error('GOOGLE_CLIENT_SECRET não configurado. Por favor, configure a variável de ambiente GOOGLE_CLIENT_SECRET no arquivo .env do backend.');
    }

    const redirectUri = this.getRedirectUri();
    console.log('🔐 Configuração OAuth:', {
      clientId: this.CLIENT_ID ? `${this.CLIENT_ID.substring(0, 10)}...` : 'NÃO CONFIGURADO',
      redirectUri,
    });

    const oauth2Client = new google.auth.OAuth2(
      this.CLIENT_ID,
      this.CLIENT_SECRET,
      redirectUri
    );

    const state = `${userId}:${nodeId}:${workflowId}`;
    const scope = 'https://www.googleapis.com/auth/spreadsheets';

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [scope],
      state,
      prompt: 'consent', // Força mostrar tela de consentimento para obter refresh_token
    });

    return authUrl;
  }

  /**
   * Processar callback do OAuth e salvar tokens
   */
  static async handleAuthCallback(code: string, userId: string): Promise<GoogleTokens> {
    const redirectUri = this.getRedirectUri();
    const oauth2Client = new google.auth.OAuth2(
      this.CLIENT_ID,
      this.CLIENT_SECRET,
      redirectUri
    );

    try {
      // Trocar código por tokens
      const { tokens } = await oauth2Client.getToken(code);

      if (!tokens.access_token) {
        throw new Error('Token de acesso não recebido');
      }

      const googleTokens: GoogleTokens = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || '',
        expiry_date: tokens.expiry_date || Date.now() + 3600000, // 1 hora padrão
        scope: tokens.scope,
        token_type: tokens.token_type || 'Bearer',
      };

      // Salvar tokens no banco de dados
      await this.saveTokens(userId, googleTokens);

      return googleTokens;
    } catch (error: any) {
      console.error('Erro ao processar callback OAuth:', error);
      throw new Error(`Erro ao obter tokens: ${error.message}`);
    }
  }

  /**
   * Salvar tokens no banco de dados
   */
  private static async saveTokens(userId: string, tokens: GoogleTokens): Promise<void> {
    const query = `
      INSERT INTO google_tokens (user_id, access_token, refresh_token, expiry_date, scope, token_type)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        expiry_date = EXCLUDED.expiry_date,
        scope = EXCLUDED.scope,
        token_type = EXCLUDED.token_type,
        updated_at = CURRENT_TIMESTAMP
    `;

    await pgPool.query(query, [
      userId,
      tokens.access_token,
      tokens.refresh_token,
      tokens.expiry_date,
      tokens.scope,
      tokens.token_type,
    ]);
  }

  /**
   * Obter tokens do banco de dados
   */
  private static async getTokens(userId: string): Promise<GoogleTokens | null> {
    const query = `
      SELECT access_token, refresh_token, expiry_date, scope, token_type
      FROM google_tokens
      WHERE user_id = $1
    `;

    const result = await pgPool.query(query, [userId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      access_token: row.access_token,
      refresh_token: row.refresh_token,
      expiry_date: row.expiry_date,
      scope: row.scope,
      token_type: row.token_type,
    };
  }

  /**
   * Obter cliente OAuth autenticado (com refresh automático)
   */
  private static async getAuthenticatedClient(userId: string): Promise<any> {
    let tokens = await this.getTokens(userId);

    if (!tokens) {
      throw new Error('Usuário não autenticado com Google');
    }

    const redirectUri = this.getRedirectUri();
    const oauth2Client = new google.auth.OAuth2(
      this.CLIENT_ID,
      this.CLIENT_SECRET,
      redirectUri
    );

    oauth2Client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
    });

    // Verificar se token expirou e renovar se necessário
    if (tokens.expiry_date && Date.now() >= tokens.expiry_date) {
      console.log(`🔄 Token expirado para usuário ${userId}. Renovando...`);
      
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        
        // Atualizar tokens
        const updatedTokens: GoogleTokens = {
          access_token: credentials.access_token || tokens.access_token,
          refresh_token: credentials.refresh_token || tokens.refresh_token,
          expiry_date: credentials.expiry_date || Date.now() + 3600000,
          scope: credentials.scope || undefined,
          token_type: credentials.token_type || 'Bearer',
        };

        await this.saveTokens(userId, updatedTokens);
        oauth2Client.setCredentials({
          access_token: updatedTokens.access_token,
          refresh_token: updatedTokens.refresh_token,
          expiry_date: updatedTokens.expiry_date,
        });
      } catch (error: any) {
        console.error('Erro ao renovar token:', error);
        throw new Error('Erro ao renovar token de acesso. Por favor, autentique novamente.');
      }
    }

    return oauth2Client;
  }

  /**
   * Verificar se usuário está autenticado
   */
  static async isUserAuthenticated(userId: string): Promise<boolean> {
    const tokens = await this.getTokens(userId);
    return tokens !== null;
  }

  /**
   * Criar planilha no Google Sheets
   */
  static async createSpreadsheet(
    userId: string,
    name: string,
    sheetName: string
  ): Promise<SpreadsheetInfo> {
    const auth = await this.getAuthenticatedClient(userId);
    const sheets = google.sheets({ version: 'v4', auth });

    try {
      // Criar nova planilha
      const createResponse = await sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title: name,
          },
          sheets: [
            {
              properties: {
                title: sheetName,
              },
            },
          ],
        },
      });

      const spreadsheetId = createResponse.data.spreadsheetId;
      if (!spreadsheetId) {
        throw new Error('ID da planilha não retornado');
      }

      const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

      // Adicionar cabeçalhos na primeira linha
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1:Z1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [['Timestamp', 'Telefone', 'Instância']],
        },
      });

      return {
        id: spreadsheetId,
        name,
        url: spreadsheetUrl,
      };
    } catch (error: any) {
      console.error('Erro ao criar planilha:', error);
      throw new Error(`Erro ao criar planilha: ${error.message}`);
    }
  }

  /**
   * Adicionar dados à planilha
   */
  static async appendData(
    userId: string,
    spreadsheetId: string,
    sheetName: string,
    data: any[]
  ): Promise<void> {
    const auth = await this.getAuthenticatedClient(userId);
    const sheets = google.sheets({ version: 'v4', auth });

    try {
      // Converter objeto de dados em array de valores
      const values: any[][] = [];

      for (const row of data) {
        const rowValues: any[] = [];
        
        // Se for objeto, converter para array ordenado
        if (typeof row === 'object' && row !== null) {
          // Ordem: timestamp, telefone, instância, depois todos os outros campos
          rowValues.push(row.timestamp || new Date().toISOString());
          rowValues.push(row.contactPhone || row.phone || '');
          rowValues.push(row.instanceId || '');
          
          // Adicionar outros campos do objeto
          Object.keys(row).forEach((key) => {
            if (!['timestamp', 'contactPhone', 'phone', 'instanceId'].includes(key)) {
              rowValues.push(row[key]);
            }
          });
        } else {
          // Se for array, usar diretamente
          rowValues.push(...(Array.isArray(row) ? row : [row]));
        }

        values.push(rowValues);
      }

      // Adicionar dados à planilha
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetName}!A:Z`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values,
        },
      });

      console.log(`✅ ${values.length} linha(s) adicionada(s) à planilha ${spreadsheetId}`);
    } catch (error: any) {
      console.error('Erro ao adicionar dados à planilha:', error);
      throw new Error(`Erro ao adicionar dados: ${error.message}`);
    }
  }

  /**
   * Obter informações da planilha
   */
  static async getSpreadsheetInfo(
    userId: string,
    spreadsheetId: string
  ): Promise<SpreadsheetInfo> {
    const auth = await this.getAuthenticatedClient(userId);
    const sheets = google.sheets({ version: 'v4', auth });

    try {
      const response = await sheets.spreadsheets.get({
        spreadsheetId,
      });

      const title = response.data.properties?.title || 'Planilha sem nome';
      const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

      return {
        id: spreadsheetId,
        name: title,
        url,
      };
    } catch (error: any) {
      console.error('Erro ao obter informações da planilha:', error);
      throw new Error(`Erro ao obter informações: ${error.message}`);
    }
  }
}
