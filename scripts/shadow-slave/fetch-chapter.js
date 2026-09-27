#!/usr/bin/env node

const relay = process.env.BROWSER_RELAY_URL ?? 'http://127.0.0.1:9224';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

import fs from 'node:fs/promises';
import path from 'node:path';

const url =
  'https://shadowslave.space/chapters/';


async function getRelayJson(pathname, description) {
  const response = await fetch(`${relay}${pathname}`);
  if (!response.ok) throw new Error(`${description}: HTTP ${response.status}`);
  return response.json();
}

async function getRelayWebSocketUrl() {
  const { webSocketDebuggerUrl } = await getRelayJson('/json/version', 'Relay unavailable');
  if (!webSocketDebuggerUrl) throw new Error('Relay response has no CDP WebSocket URL');
  return webSocketDebuggerUrl;
}

async function getPageTarget() {
  const targets = await getRelayJson('/json/list', 'Could not list relay tabs');
  const target = targets.find(item => item.type === 'page' && item.url.startsWith('http'))
    ?? targets.find(item => item.type === 'page');
  if (!target) throw new Error('No browser page is available in the relay; open a tab in the relayed browser and try again');
  return target;
}

function connectWebSocket(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('Could not connect to relay CDP WebSocket')), { once: true });
  });
  return { socket, ready };
}

function createCdpCommand(socket) {
  let nextId = 0;
  const pending = new Map();

  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(new Error(message.error.message)) : resolve(message.result);
  });

  return (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

async function attachToTarget(send, target) {
  const { sessionId } = await send('Target.attachToTarget', { targetId: target.id, flatten: true });
  return sessionId;
}

async function navigate(send, sessionId, destination) {
  await send('Page.enable', {}, sessionId);
  await send('Page.navigate', { url: destination }, sessionId);
  await waitForPageLoad(send, sessionId);
}

async function waitForPageLoad(send, sessionId) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const result = await send('Runtime.evaluate', {
      expression: 'document.readyState',
      returnByValue: true
    }, sessionId);
    if (result.result?.value === 'complete') return;
    await sleep(250);
  }
  throw new Error('Page did not finish loading within 15 seconds');
}

async function readPage(send, sessionId) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const result = await send('Runtime.evaluate', {
      expression: `(() => {
        const article = document.querySelector('article');

        return {
          title: document.title,
          text: article?.innerText ?? ""
        };
      })()`,
      returnByValue: true
    }, sessionId);

    const page = result.result?.value ?? {};

    if (page.text?.trim()) return page;

    await sleep(250);
  }

  return {};
}

function printPage(page) {
  console.log(`Title: ${page.title || '(not available)'}\n\n${page.text || '(no visible text)'}`);
}

function urlToFilename(urlString) {
  const parsed = new URL(urlString);

  const parts = parsed.pathname
    .split('/')
    .filter(Boolean);

  if (parts[0] === 'series') {
    parts.shift();
  }

  const name = parts
    .join('-')
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .replace(/-+/g, '-');

  return `${name || 'index'}.md`;
}

async function savePageContent(urlString, page) {
  const outputDir = path.resolve('./contents');
  await fs.mkdir(outputDir, { recursive: true });

  const filename = urlToFilename(urlString);
  const outputPath = path.join(outputDir, filename);

  const markdown = `# ${page.title || 'Untitled'}
Source: ${urlString}

---

${page.text || ''}
`;

  await fs.writeFile(outputPath, markdown, 'utf8');

  return outputPath;
}

async function main() {
  const [webSocketUrl, target] = await Promise.all([
    getRelayWebSocketUrl(),
    getPageTarget()
  ]);

  const { socket, ready } = connectWebSocket(webSocketUrl);
  await ready;

  const send = createCdpCommand(socket);

  try {
    const sessionId = await attachToTarget(send, target);
    for (let i = 0; i < 150; i++) {
      var chapter = `${url}${i+1}`;
      await navigate(send, sessionId, chapter);
      const page = await readPage(send, sessionId);
      const outputPath = await savePageContent(chapter, page);
      console.log(`\nSaved to: ${outputPath}`);
      await sleep(300);
    }
    
  } finally {
    socket.close();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
