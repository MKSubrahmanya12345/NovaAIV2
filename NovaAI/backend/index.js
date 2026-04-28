import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
const PORT = 4001;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/compile', async (req, res) => {
  const { code } = req.body;

  if (!code || typeof code !== 'string' || code.trim() === '') {
    return res.status(400).json({ error: 'Missing or invalid "code" field' });
  }

  try {
    const hexiRes = await fetch('https://hexi.wokwi.com/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sketch: code }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await hexiRes.json();
    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: 'Compilation service unreachable' });
  }
});

app.listen(PORT, () => {
  console.log(`Nova Compiler API running at http://localhost:${PORT}`);
});
