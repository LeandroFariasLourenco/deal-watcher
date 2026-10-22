import express from 'express';
import path from 'path';
import axios from 'axios';
import { ITADService, ALLOWED_SHOP_IDS } from './src/services/itad';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

const isProd = process.env.NODE_ENV === 'production';
const app = express();

const DB_FILE = path.join(process.cwd(), 'data.json');

const parseShopIds = (shopsParam: unknown): number[] => {
  if (Array.isArray(shopsParam)) {
    const parsed = shopsParam
      .flatMap(item => String(item).split(','))
      .map(id => Number(id.trim()))
      .filter(id => !Number.isNaN(id) && id > 0);
    return parsed.length > 0 ? parsed : [...ALLOWED_SHOP_IDS];
  }
  if (typeof shopsParam === 'string' && shopsParam.trim().length > 0) {
    const parsed = shopsParam
      .split(',')
      .map(id => Number(id.trim()))
      .filter(id => !Number.isNaN(id) && id > 0);
    return parsed.length > 0 ? parsed : [...ALLOWED_SHOP_IDS];
  }
  return [...ALLOWED_SHOP_IDS];
};

const loadData = () => {
  if (!fs.existsSync(DB_FILE)) {
    return { 
      settings: { 
        country: 'BR',
        check_interval_minutes: 240 
      }, 
      notifications: [] 
    };
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  } catch (e) {
    return { 
      settings: { 
        country: 'BR',
        check_interval_minutes: 240 
      }, 
      notifications: [] 
    };
  }
};

const saveData = (data: any) => {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
};

async function startServer() {
  app.use(express.json());
  const itad = new ITADService();

  app.get('/api/settings', (_req, res) => {
    res.json(loadData().settings);
  });

  app.post('/api/settings', (req, res) => {
    const data = loadData();
    data.settings = { ...data.settings, ...req.body };
    saveData(data);
    res.json({ success: true });
  });

  app.get('/api/notifications', async (_req, res) => {
    res.json(loadData().notifications);
  });

  app.get('/api/proxy/itad/search', async (req, res) => {
    const { q, offset, limit } = req.query;
    try {
      const results = await itad.searchGames(q as string, Number(offset) || 0, Number(limit) || 20);
      res.json(results);
    } catch (e: any) {
      const errorStatus = e.response?.status || 500;
      const errorData = e.response?.data || e.message;
      res.status(errorStatus).json({ error: 'ITAD Search Failed', details: errorData });
    }
  });

  app.get('/api/proxy/itad/shops', async (req, res) => {
    const country = (req.query.country as string) || 'BR';
    try {
      const results = await itad.getShops(country);
      res.json(results);
    } catch (e: any) {
      res.status(500).json({ error: 'ITAD Shops Failed' });
    }
  });

  app.get('/api/proxy/itad/deals', async (req, res) => {
    const { country, offset, limit, shops, sort } = req.query;
    const targetCountry = (country as string) || 'BR';
    const shopIds = parseShopIds(shops);
    try {
      const results = await itad.getDeals(targetCountry, Number(offset) || 0, Number(limit) || 20, shopIds, (sort as string) || undefined);
      res.json(results);
    } catch (e: any) {
      res.status(500).json({ error: 'ITAD Deals Failed' });
    }
  });

  app.post('/api/proxy/itad/prices', async (req, res) => {
    const uuids = Array.isArray(req.body) ? req.body : req.body?.uuids || [];
    const shopIds = parseShopIds(req.query.shops || req.body?.shops);
    try {
      const results = await itad.getPrices(uuids, 'BR', shopIds);
      res.json(results);
    } catch (e: any) {
      res.status(500).json({ error: 'ITAD Prices Failed' });
    }
  });

  app.get('/api/proxy/itad/details/:uuid', async (req, res) => {
    const { uuid } = req.params;
    const shopIds = parseShopIds(req.query.shops);
    try {
      const details = await itad.getGameDetails(uuid, 'BR', shopIds);
      res.json(details);
    } catch (e: any) {
      res.status(500).json({ error: 'ITAD Details Failed' });
    }
  });

  app.get('/api/proxy/itad/history/:uuid', async (req, res) => {
    const { uuid } = req.params;
    const shopIds = parseShopIds(req.query.shops);
    try {
      const history = await itad.getHistory(uuid, 'BR', shopIds);
      res.json(history);
    } catch (e: any) {
      res.status(500).json({ error: 'ITAD History Failed' });
    }
  });

  app.get('/api/proxy/itad/giveaways', async (req, res) => {
    const { offset, limit, sort } = req.query;
    try {
      const results = await itad.getGiveaways(Number(offset) || 0, Number(limit) || 20, (sort as string) || undefined);
      res.json(results);
    } catch (e: any) {
      res.status(500).json({ error: 'ITAD Giveaways Failed' });
    }
  });

  app.get('/api/proxy/steam/storesearch', async (req, res) => {
    const term = (req.query.term as string) || '';
    if (!term.trim()) return res.status(400).json({ error: 'Term required' });
    try {
      const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term.trim())}&l=portuguese&cc=BR`;
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 10000
      });
      res.json(response.data);
    } catch (e: any) {
      console.error('Steam Storesearch Error:', e.message);
      res.status(500).json({ error: 'Steam search failed', details: e.message });
    }
  });

  app.get('/api/proxy/ggdeals/prices', async (req, res) => {
    const ids = (req.query.ids as string) || '';
    const region = (req.query.region as string) || 'br';
    const key = (req.query.key as string) || '9YQGBo_uCxKnRwN5oyo37uSQAQYZa7PE';
    if (!ids.trim()) return res.status(400).json({ error: 'Steam App ID required' });
    try {
      const url = `https://api.gg.deals/v1/prices/by-steam-app-id/?key=${encodeURIComponent(key)}&ids=${encodeURIComponent(ids)}&region=${encodeURIComponent(region)}`;
      const response = await axios.get(url, {
        timeout: 10000,
        validateStatus: () => true
      });
      res.status(response.status).json(response.data);
    } catch (e: any) {
      console.error('GG.deals Error:', e.message);
      res.status(500).json({ error: 'GG.deals request failed', details: e.message });
    }
  });

  const vite = !isProd ? await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  }) : null;

  if (vite) {
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist/index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
