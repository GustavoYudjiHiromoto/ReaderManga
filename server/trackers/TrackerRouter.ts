import { Router, Request, Response } from 'express';

export const trackerRouter = Router();

// AniList GraphQL Proxy
trackerRouter.post('/anilist/graphql', async (req: Request, res: Response) => {
  try {
    const { query, variables } = req.body;
    const authHeader = req.headers.authorization;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables })
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error: any) {
    return res.status(500).json({
      errors: [{ message: error?.message || 'Falha ao conectar com AniList GraphQL' }]
    });
  }
});

// MyAnimeList (MAL) Token Exchange (PKCE)
trackerRouter.post('/mal/token', async (req: Request, res: Response) => {
  try {
    const { clientId, clientSecret, code, codeVerifier, redirectUri } = req.body;

    if (!clientId || !code || !codeVerifier || !redirectUri) {
      return res.status(400).json({
        success: false,
        error: 'Parâmetros obrigatórios ausentes para troca de token do MyAnimeList (clientId, code, codeVerifier, redirectUri).'
      });
    }

    const bodyParams = new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri
    });

    if (clientSecret) {
      bodyParams.append('client_secret', clientSecret);
    }

    const response = await fetch('https://myanimelist.net/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: bodyParams.toString()
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Falha ao trocar código de autorização do MyAnimeList.'
    });
  }
});

// MyAnimeList API Proxy (Manga search, user profile, list status)
trackerRouter.all('/mal/proxy/*', async (req: Request, res: Response) => {
  try {
    const subPath = req.params[0] || '';
    const queryStr = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    const targetUrl = `https://api.myanimelist.net/v2/${subPath}${queryStr}`;

    const headers: Record<string, string> = {};
    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization as string;
    }
    if (req.headers['x-mal-client-id']) {
      headers['X-MAL-CLIENT-ID'] = req.headers['x-mal-client-id'] as string;
    }

    const options: RequestInit = {
      method: req.method,
      headers
    };

    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      const formParams = new URLSearchParams();
      for (const [key, val] of Object.entries(req.body)) {
        if (val !== undefined && val !== null) {
          formParams.append(key, String(val));
        }
      }
      options.body = formParams.toString();
    }

    const response = await fetch(targetUrl, options);
    const data = await response.json().catch(() => ({}));
    return res.status(response.status).json(data);
  } catch (error: any) {
    return res.status(500).json({
      error: 'mal_proxy_error',
      message: error?.message || 'Falha ao comunicar com a API do MyAnimeList.'
    });
  }
});
