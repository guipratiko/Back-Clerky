# Configuração do Firebase no Servidor de Produção

## Opção 1: Variáveis de Ambiente (Recomendado)

Configure as seguintes variáveis de ambiente no servidor de produção:

```env
FIREBASE_PROJECT_ID=clerky-7bdad
FIREBASE_PRIVATE_KEY_ID=5c940f24b924eb863fcdad4dcf1596a45e6c23e1
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDE8JFhGP+oRT/9\n7/H3cqX8bjZb2FcT3H09vx6H5RklDxBECVzBnpbbX1+8oBn4qSga6lV/o66D8lLX\n0lqu+jiL3nDLLwD5CQg0KBse/fL6TWpg77rjoMOUe8pgbbSR1w/IR83laMKyxlnX\naNydisfg8NxowIEG1qgsLViBr7x31dEEHe9E7tEtz1F40jLiwjd9TByoh6bWd6pI\nC5uq6vezIV2WpU4ONMRmFhUWfBwPFz6JiixCVQUWCU1z9UeU42TtGQ3+GMnRmDGe\n5LDM6mJXhDTM/CZdZSuM5CDVR3d4pqPCbt4qOL9AWy42j8xEGyojGeytX40lgxeM\nEgwfhfHzAgMBAAECggEARJJK3Fca9VkfXejFBFasCsfJL5OVRjoYdX5tP/36Elg7\nXqUv4c65UirUJ9ZLFLS5XR3IpUe1xQWD6Ne6cYB4XeMWvPhhy1RkwdxRDSp5BsQb\nzSLLnORmFPZBUfAA1mLegOrXexBN8ndz4rgFUOl4jQ7wf5y/kET/i1pCne01nzd8\nSdfxG2bBM6dx92A/yPayejhsnqGBjerFx+XwFqbujFkniCtuqC84kpI7mtWjPstC\n5/KQXAXtrUuRmVBTtSD/5DdP4qiIhDcXFxg346DAdT60gt+Mcravg3XT7PFqSwui\n7G3bBnYqLlsJ82r8rWrqWrqtKJnlt2ch5l2BgNpqOQKBgQDlBFFhWeVESVenM0MM\neaYugaIl1oX+U/iTaVPlhS+VntZPmdR+GTC6dt0IfR3Mle2Ht4DHx4kS1dQh80f0\n9Jy1BOAky6LGpSdGqa1LYr4XaqmmsCPlnO1+lFq4S8vRrXp9ye4X6wlYk8YFQvaf\nK8Rd7L7SYx8U2xxu1qv8iM6GPwKBgQDcJLp+JubmcmkhQm0+yVaaY8wVAmFUVLhr\nnrIOs4wvB+wZyTifAL2fInMgZj3xi5nQoeRSiMtdxL4vc/SyLpmgfXwwPuAbGx+w\n2qLCbk43lYw9bq9EcJmTevNXp8rLBf41P/gAesnAkzyyaM/vBHENVGv0WGAl4sDA\nz+GrlL4vTQKBgH6rwbt/9oCrtHDFuMs4qgNFLoORQXHnzjDy7DWiUiyGu3Ex28eX\ndU1dm2orkgTr1ILhq7hUlGu3m+rfXiiN9/Nj6/pOLA2FodDC3xg4WH4pQAbznBdP\nkkkWE4umWOjz9DGJNElEdlno+nlEjZaCpc1xuiYyLyng+7wOvvgiT2EPAoGBAJQ0\nodz2IbL5SW+bweJoN8ae8zEdthrJIpNJdoRROkobYkcF4fmhzQcKcUlZq9Am9Lmx\nk/5Am/EX2BYoUY93sfOLJ4Vvfv6gpxgwSSzuh/gB1TUyhApmZ+4S8yqLCwrdkQOW\nekcQYy0jstRFnd9DNT0NHdSVfr1ix/PGwB38eIFtAoGAEaz1Uqm9P8oxp00QWHAJ\nQjZBGVzw95UFtLUu7w9a5dhJicG1SZ1fNeqxsb8pPSPMB/4hXKyYLMvaLjzHYwLD\nS9HuJTuPMjUD/P9qiIqdD7lCI1TSg9mM81ulUvESU+Mg+y0qbTapFvlza3mdSGQQ\nwlFdsXsNP9ZSKLF/isb1tUg=\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@clerky-7bdad.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=110642302136221615262
FIREBASE_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40clerky-7bdad.iam.gserviceaccount.com
```

**IMPORTANTE:** 
- O `FIREBASE_PRIVATE_KEY` deve incluir as quebras de linha (`\n`)
- Use aspas duplas ao definir no `.env`
- No servidor, configure via sistema de variáveis de ambiente ou arquivo `.env` seguro

## Opção 2: Arquivo JSON (Alternativa)

Se preferir usar o arquivo JSON no servidor:

1. Envie o arquivo `clerky-7bdad-firebase-adminsdk-fbsvc-5c940f24b9.json` para o servidor de produção
2. Configure a variável de ambiente:
   ```env
   FIREBASE_SERVICE_ACCOUNT_PATH=/caminho/absoluto/para/clerky-7bdad-firebase-adminsdk-fbsvc-5c940f24b9.json
   ```

## Ordem de Prioridade

O sistema tenta inicializar o Firebase na seguinte ordem:

1. **Variáveis de ambiente** (se todas estiverem configuradas) ← **Produção**
2. **Arquivo JSON** (se não encontrar variáveis de ambiente) ← **Desenvolvimento**

## Verificar Configuração

Após configurar, teste com:

```bash
# Via npm script
API_URL=https://back.clerky.com.br npm run send-promo-android

# Ou via curl
# (veja CURL_EXAMPLES.md)
```

Se aparecer `✅ Firebase Admin SDK inicializado com sucesso (via variáveis de ambiente)`, está funcionando!

