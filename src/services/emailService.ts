/**
 * Serviço de envio de emails
 * Usa nodemailer para envio de emails transacionais
 */

import nodemailer from 'nodemailer';
import { EMAIL_CONFIG } from '../config/constants';

// Criar transporter de email
const createTransporter = () => {
  return nodemailer.createTransport({
    host: EMAIL_CONFIG.SMTP_HOST,
    port: EMAIL_CONFIG.SMTP_PORT,
    secure: EMAIL_CONFIG.SMTP_PORT === 465, // true para 465, false para outras portas
    auth: {
      user: EMAIL_CONFIG.SMTP_USER,
      pass: EMAIL_CONFIG.SMTP_PASS,
    },
  });
};

/**
 * Enviar email de ativação de conta
 * @param email - Email do destinatário
 * @param name - Nome do usuário
 * @param activationToken - Token de ativação
 */
export const sendActivationEmail = async (
  email: string,
  name: string,
  activationToken: string
): Promise<void> => {
  try {
    const transporter = createTransporter();
    const activationUrl = `${EMAIL_CONFIG.FRONTEND_URL}/ativar-conta?token=${activationToken}`;

    const mailOptions = {
      from: `"${EMAIL_CONFIG.FROM_NAME}" <${EMAIL_CONFIG.FROM_EMAIL}>`,
      to: email,
      subject: 'Ative sua conta Clerky Premium',
      html: `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #1f2937;
              background-color: #f3f4f6;
              padding: 20px;
            }
            .email-wrapper {
              max-width: 600px;
              margin: 0 auto;
              background-color: #ffffff;
              border-radius: 12px;
              overflow: hidden;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            .header {
              background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%);
              padding: 40px 30px;
              text-align: center;
            }
            .logo-container {
              margin-bottom: 20px;
            }
            .logo {
              max-width: 180px;
              height: auto;
              display: inline-block;
            }
            .header-title {
              color: #ffffff;
              font-size: 28px;
              font-weight: 700;
              margin: 0;
              text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
            }
            .header-subtitle {
              color: #e0e7ff;
              font-size: 16px;
              margin-top: 10px;
              font-weight: 400;
            }
            .content {
              padding: 40px 30px;
              background-color: #ffffff;
            }
            .greeting {
              font-size: 18px;
              color: #1f2937;
              margin-bottom: 20px;
            }
            .greeting strong {
              color: #4F46E5;
              font-weight: 600;
            }
            .message {
              font-size: 16px;
              color: #4b5563;
              margin-bottom: 15px;
              line-height: 1.7;
            }
            .highlight-box {
              background: linear-gradient(135deg, #f0f9ff 0%, #e0e7ff 100%);
              border-left: 4px solid #4F46E5;
              padding: 20px;
              margin: 30px 0;
              border-radius: 8px;
            }
            .highlight-box p {
              margin: 0;
              color: #1e40af;
              font-weight: 500;
            }
            .button-container {
              text-align: center;
              margin: 35px 0;
            }
            .button {
              display: inline-block;
              padding: 16px 40px;
              background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%);
              color: #ffffff !important;
              text-decoration: none;
              border-radius: 8px;
              font-weight: 600;
              font-size: 16px;
              box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);
              transition: all 0.3s ease;
            }
            .button:hover {
              transform: translateY(-2px);
              box-shadow: 0 6px 16px rgba(79, 70, 229, 0.5);
            }
            .link-container {
              background-color: #f9fafb;
              padding: 20px;
              border-radius: 8px;
              margin: 25px 0;
              border: 1px solid #e5e7eb;
            }
            .link-label {
              font-size: 12px;
              color: #6b7280;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-bottom: 8px;
              font-weight: 600;
            }
            .link-url {
              word-break: break-all;
              color: #4F46E5;
              font-size: 14px;
              text-decoration: none;
            }
            .warning-box {
              background-color: #fef3c7;
              border-left: 4px solid #f59e0b;
              padding: 15px 20px;
              margin: 25px 0;
              border-radius: 8px;
            }
            .warning-box p {
              margin: 0;
              color: #92400e;
              font-size: 14px;
            }
            .warning-box strong {
              color: #78350f;
            }
            .features {
              margin: 30px 0;
            }
            .features-title {
              font-size: 18px;
              font-weight: 600;
              color: #1f2937;
              margin-bottom: 15px;
            }
            .feature-list {
              list-style: none;
              padding: 0;
            }
            .feature-item {
              padding: 10px 0;
              padding-left: 30px;
              position: relative;
              color: #4b5563;
              font-size: 15px;
            }
            .feature-item:before {
              content: "✓";
              position: absolute;
              left: 0;
              color: #10b981;
              font-weight: bold;
              font-size: 18px;
            }
            .footer {
              background-color: #f9fafb;
              padding: 30px;
              text-align: center;
              border-top: 1px solid #e5e7eb;
            }
            .footer-text {
              font-size: 13px;
              color: #6b7280;
              margin-bottom: 10px;
              line-height: 1.6;
            }
            .footer-links {
              margin-top: 20px;
            }
            .footer-link {
              color: #4F46E5;
              text-decoration: none;
              font-size: 13px;
              margin: 0 10px;
            }
            .footer-link:hover {
              text-decoration: underline;
            }
            .divider {
              height: 1px;
              background-color: #e5e7eb;
              margin: 25px 0;
            }
            @media only screen and (max-width: 600px) {
              body {
                padding: 10px;
              }
              .header {
                padding: 30px 20px;
              }
              .content {
                padding: 30px 20px;
              }
              .button {
                padding: 14px 30px;
                font-size: 15px;
              }
              .header-title {
                font-size: 24px;
              }
            }
          </style>
        </head>
        <body>
          <div class="email-wrapper">
            <!-- Header -->
            <div class="header">
              <div class="logo-container">
                <img src="${EMAIL_CONFIG.LOGO_URL}" alt="Clerky Logo" class="logo" />
              </div>
              <h1 class="header-title">Bem-vindo ao Clerky Premium!</h1>
              <p class="header-subtitle">Sua conta está quase pronta</p>
            </div>

            <!-- Content -->
            <div class="content">
              <p class="greeting">Olá, <strong>${name}</strong>! 👋</p>
              
              <p class="message">
                Parabéns! Sua compra do plano <strong>Premium</strong> foi confirmada com sucesso.
              </p>

              <div class="highlight-box">
                <p>✨ Agora você tem acesso a todas as funcionalidades premium do Clerky!</p>
              </div>

              <p class="message">
                Para ativar sua conta e começar a usar todas as funcionalidades premium, clique no botão abaixo:
              </p>

              <div class="button-container">
                <a href="${activationUrl}" class="button">🚀 Ativar Minha Conta</a>
              </div>

              <div class="link-container">
                <div class="link-label">Ou copie e cole este link no seu navegador:</div>
                <a href="${activationUrl}" class="link-url">${activationUrl}</a>
              </div>

              <div class="warning-box">
                <p>
                  <strong>⏰ Importante:</strong> Este link expira em <strong>7 dias</strong>. 
                  Se não ativar sua conta neste período, entre em contato com o suporte.
                </p>
              </div>

              <div class="divider"></div>

              <div class="features">
                <h3 class="features-title">O que você ganha com o Premium:</h3>
                <ul class="feature-list">
                  <li class="feature-item">Acesso completo a todas as funcionalidades</li>
                  <li class="feature-item">Disparos em massa ilimitados</li>
                  <li class="feature-item">CRM completo e personalizado</li>
                  <li class="feature-item">Workflows automatizados (MindClerky)</li>
                  <li class="feature-item">Agente de IA avançado</li>
                  <li class="feature-item">Gerenciamento de grupos</li>
                  <li class="feature-item">Suporte prioritário</li>
                </ul>
              </div>
            </div>

            <!-- Footer -->
            <div class="footer">
              <p class="footer-text">
                Este é um email automático, por favor não responda.
              </p>
              <p class="footer-text">
                Se você não solicitou esta conta, pode ignorar este email com segurança.
              </p>
              <div class="footer-links">
                <a href="https://clerky.com.br" class="footer-link">Visite nosso site</a>
                <a href="https://clerky.com.br/suporte" class="footer-link">Suporte</a>
                <a href="https://clerky.com.br/privacidade" class="footer-link">Privacidade</a>
              </div>
              <p class="footer-text" style="margin-top: 20px; font-size: 12px; color: #9ca3af;">
                © ${new Date().getFullYear()} Clerky. Todos os direitos reservados.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Bem-vindo ao Clerky Premium!
        
        Olá, ${name}!
        
        Parabéns! Sua compra do plano Premium foi confirmada.
        
        Para ativar sua conta e começar a usar todas as funcionalidades premium, acesse:
        ${activationUrl}
        
        Importante: Este link expira em 7 dias. Se não ativar sua conta neste período, entre em contato com o suporte.
        
        Este é um email automático, por favor não responda.
        Se você não solicitou esta conta, ignore este email.
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Email de ativação enviado para ${email}`);
  } catch (error) {
    console.error('❌ Erro ao enviar email de ativação:', error);
    throw new Error('Erro ao enviar email de ativação');
  }
};

/**
 * Enviar email de recuperação de senha
 * @param email - Email do destinatário
 * @param name - Nome do usuário
 * @param resetToken - Token de recuperação de senha
 */
export const sendPasswordResetEmail = async (
  email: string,
  name: string,
  resetToken: string
): Promise<void> => {
  try {
    const transporter = createTransporter();
    const resetUrl = `${EMAIL_CONFIG.FRONTEND_URL}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: `"${EMAIL_CONFIG.FROM_NAME}" <${EMAIL_CONFIG.FROM_EMAIL}>`,
      to: email,
      subject: 'Recuperação de Senha - Clerky',
      html: `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #1f2937;
              background-color: #f3f4f6;
              padding: 20px;
            }
            .email-wrapper {
              max-width: 600px;
              margin: 0 auto;
              background-color: #ffffff;
              border-radius: 12px;
              overflow: hidden;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            .header {
              background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%);
              padding: 40px 30px;
              text-align: center;
            }
            .logo-container {
              margin-bottom: 20px;
            }
            .logo {
              max-width: 180px;
              height: auto;
              display: inline-block;
            }
            .header-title {
              color: #ffffff;
              font-size: 28px;
              font-weight: 700;
              margin: 0;
              text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
            }
            .header-subtitle {
              color: #e0e7ff;
              font-size: 16px;
              margin-top: 10px;
              font-weight: 400;
            }
            .content {
              padding: 40px 30px;
              background-color: #ffffff;
            }
            .greeting {
              font-size: 18px;
              color: #1f2937;
              margin-bottom: 20px;
            }
            .greeting strong {
              color: #4F46E5;
              font-weight: 600;
            }
            .message {
              font-size: 16px;
              color: #4b5563;
              margin-bottom: 15px;
              line-height: 1.7;
            }
            .button-container {
              text-align: center;
              margin: 35px 0;
            }
            .button {
              display: inline-block;
              padding: 16px 40px;
              background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%);
              color: #ffffff !important;
              text-decoration: none;
              border-radius: 8px;
              font-weight: 600;
              font-size: 16px;
              box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);
              transition: all 0.3s ease;
            }
            .button:hover {
              transform: translateY(-2px);
              box-shadow: 0 6px 16px rgba(79, 70, 229, 0.5);
            }
            .link-container {
              background-color: #f9fafb;
              padding: 20px;
              border-radius: 8px;
              margin: 25px 0;
              border: 1px solid #e5e7eb;
            }
            .link-label {
              font-size: 12px;
              color: #6b7280;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-bottom: 8px;
              font-weight: 600;
            }
            .link-url {
              word-break: break-all;
              color: #4F46E5;
              font-size: 14px;
              text-decoration: none;
            }
            .warning-box {
              background-color: #fef3c7;
              border-left: 4px solid #f59e0b;
              padding: 15px 20px;
              margin: 25px 0;
              border-radius: 8px;
            }
            .warning-box p {
              margin: 0;
              color: #92400e;
              font-size: 14px;
            }
            .warning-box strong {
              color: #78350f;
            }
            .footer {
              background-color: #f9fafb;
              padding: 30px;
              text-align: center;
              border-top: 1px solid #e5e7eb;
            }
            .footer-text {
              font-size: 13px;
              color: #6b7280;
              margin-bottom: 10px;
              line-height: 1.6;
            }
            .footer-links {
              margin-top: 20px;
            }
            .footer-link {
              color: #4F46E5;
              text-decoration: none;
              font-size: 13px;
              margin: 0 10px;
            }
            .footer-link:hover {
              text-decoration: underline;
            }
            @media only screen and (max-width: 600px) {
              body {
                padding: 10px;
              }
              .header {
                padding: 30px 20px;
              }
              .content {
                padding: 30px 20px;
              }
              .button {
                padding: 14px 30px;
                font-size: 15px;
              }
              .header-title {
                font-size: 24px;
              }
            }
          </style>
        </head>
        <body>
          <div class="email-wrapper">
            <!-- Header -->
            <div class="header">
              <div class="logo-container">
                <img src="${EMAIL_CONFIG.LOGO_URL}" alt="Clerky Logo" class="logo" />
              </div>
              <h1 class="header-title">Recuperação de Senha</h1>
              <p class="header-subtitle">Redefina sua senha com segurança</p>
            </div>

            <!-- Content -->
            <div class="content">
              <p class="greeting">Olá, <strong>${name}</strong>! 👋</p>
              
              <p class="message">
                Recebemos uma solicitação para redefinir a senha da sua conta Clerky.
              </p>

              <p class="message">
                Clique no botão abaixo para criar uma nova senha:
              </p>

              <div class="button-container">
                <a href="${resetUrl}" class="button">🔐 Redefinir Senha</a>
              </div>

              <div class="link-container">
                <div class="link-label">Ou copie e cole este link no seu navegador:</div>
                <a href="${resetUrl}" class="link-url">${resetUrl}</a>
              </div>

              <div class="warning-box">
                <p>
                  <strong>⏰ Importante:</strong> Este link expira em <strong>1 hora</strong>. 
                  Se você não solicitou esta recuperação de senha, ignore este email.
                </p>
              </div>

              <p class="message" style="margin-top: 30px; font-size: 14px; color: #6b7280;">
                Por segurança, nunca compartilhe este link com outras pessoas.
              </p>
            </div>

            <!-- Footer -->
            <div class="footer">
              <p class="footer-text">
                Este é um email automático, por favor não responda.
              </p>
              <p class="footer-text">
                Se você não solicitou esta recuperação de senha, pode ignorar este email com segurança.
              </p>
              <div class="footer-links">
                <a href="https://clerky.com.br" class="footer-link">Visite nosso site</a>
                <a href="https://clerky.com.br/suporte" class="footer-link">Suporte</a>
                <a href="https://clerky.com.br/privacidade" class="footer-link">Privacidade</a>
              </div>
              <p class="footer-text" style="margin-top: 20px; font-size: 12px; color: #9ca3af;">
                © ${new Date().getFullYear()} Clerky. Todos os direitos reservados.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Recuperação de Senha - Clerky
        
        Olá, ${name}!
        
        Recebemos uma solicitação para redefinir a senha da sua conta Clerky.
        
        Para criar uma nova senha, acesse:
        ${resetUrl}
        
        Importante: Este link expira em 1 hora. Se você não solicitou esta recuperação de senha, ignore este email.
        
        Por segurança, nunca compartilhe este link com outras pessoas.
        
        Este é um email automático, por favor não responda.
        Se você não solicitou esta recuperação de senha, ignore este email.
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Email de recuperação de senha enviado para ${email}`);
  } catch (error) {
    console.error('❌ Erro ao enviar email de recuperação de senha:', error);
    throw new Error('Erro ao enviar email de recuperação de senha');
  }
};

