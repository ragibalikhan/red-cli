import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';

const EMBEDDINGS_PATH = join(homedir(), '.red', 'memory-embeddings.json');

function ensureDir(path) {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function loadEmbeddings() {
  try {
    if (existsSync(EMBEDDINGS_PATH)) {
      return JSON.parse(readFileSync(EMBEDDINGS_PATH, 'utf-8'));
    }
  } catch {}
  return { entries: [] };
}

function saveEmbeddings(data) {
  ensureDir(EMBEDDINGS_PATH);
  writeFileSync(EMBEDDINGS_PATH, JSON.stringify(data, null, 2));
}

async function fetchEmbedding(text, apiKey) {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text
    })
  });

  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export class MemoryEmbeddings {
  constructor() {
    this.data = loadEmbeddings();
  }

  async addEntry(text, metadata = {}) {
    const apiKey = process.env.OPENAI_API_KEY;
    let embedding = null;

    if (apiKey) {
      try {
        embedding = await fetchEmbedding(text, apiKey);
      } catch (err) {
        console.warn(chalk.yellow(`  ⚠️  Embedding failed: ${err.message}. Storing without embedding.`));
      }
    }

    this.data.entries.push({
      text,
      metadata,
      embedding,
      timestamp: new Date().toISOString()
    });

    saveEmbeddings(this.data);
  }

  async search(query, limit = 5) {
    const apiKey = process.env.OPENAI_API_KEY;

    if (apiKey) {
      try {
        const queryEmbedding = await fetchEmbedding(query, apiKey);
        const results = this.data.entries
          .filter(e => e.embedding)
          .map(entry => ({
            ...entry,
            score: cosineSimilarity(queryEmbedding, entry.embedding)
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);

        if (results.length > 0) return results;
      } catch (err) {
        console.warn(chalk.yellow(`  ⚠️  Semantic search failed: ${err.message}. Falling back to fuzzy.`));
      }
    }

    return this.fuzzySearch(query, limit);
  }

  fuzzySearch(query, limit = 5) {
    const lower = query.toLowerCase();
    const results = this.data.entries
      .map(entry => {
        const text = entry.text.toLowerCase();
        let score = 0;
        if (text.includes(lower)) {
          score = lower.length / text.length;
        } else {
          const words = lower.split(/\s+/);
          const matches = words.filter(w => text.includes(w)).length;
          score = matches / words.length * 0.5;
        }
        return { ...entry, score };
      })
      .filter(e => e.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return results;
  }

  getAll() {
    return this.data.entries;
  }

  clear() {
    this.data = { entries: [] };
    saveEmbeddings(this.data);
  }
}

export function createMemoryEmbeddings() {
  return new MemoryEmbeddings();
}
