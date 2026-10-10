#!/usr/bin/env node
/**
 * Cache local das imagens que vêm do GitHub.
 *
 * Baixa o social preview de cada repositório (opengraph.githubassets.com) e a
 * foto de perfil, salvando tudo em assets/images/github/. Assim o site serve
 * arquivos próprios e nenhum visitante chama a API do GitHub, o que elimina o
 * erro 429 (rate limit) que aparecia quando as 6 imagens eram pedidas de uma vez.
 *
 *   node tools/atualizar-imagens.js
 *
 * O workflow .github/workflows/atualizar-imagens.yml roda isto sozinho a cada mês.
 * Para trocar a foto de perfil ou um repositório, edite as listas abaixo.
 */

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const USUARIO = 'DouglasGDev';
const PASTA_SAIDA = 'assets/images/github';

const REPOS = [
  'java-angular-chat',
  'devops-desktop',
  'SaleProERP',
  'ConsultaCNPJ',
  'projeto-pizzaria',
  'Iso-City',
];

const ALVOS = [
  ...REPOS.map(r => ({
    url: `https://opengraph.githubassets.com/1/${USUARIO}/${r}`,
    arquivo: `${r}.png`,
  })),
  { url: `https://github.com/${USUARIO}.png`, arquivo: 'perfil.jpg' },
];

const TENTATIVAS = 5;
const PAUSA_ENTRE_URLS_MS = 4000;

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirSaida = path.join(raiz, PASTA_SAIDA);

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function baixar(url, destino) {
  for (let n = 1; n <= TENTATIVAS; n++) {
    let resp;
    try {
      resp = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'vcard-portfolio-cache/1.0' },
      });
    } catch (err) {
      console.warn(`  tentativa ${n}/${TENTATIVAS}: ${err.message}`);
      await sleep(n * 3000);
      continue;
    }

    if (resp.status === 429) {
      const espera = Number(resp.headers.get('retry-after')) || n * 20;
      console.warn(`  tentativa ${n}/${TENTATIVAS}: 429, aguardando ${espera}s`);
      await sleep(espera * 1000);
      continue;
    }

    if (!resp.ok) {
      console.warn(`  tentativa ${n}/${TENTATIVAS}: HTTP ${resp.status}`);
      await sleep(n * 3000);
      continue;
    }

    const buf = Buffer.from(await resp.arrayBuffer());
    // Um preview válido tem dezenas de KB; algo minúsculo é página de erro.
    if (buf.length < 2000) {
      console.warn(`  tentativa ${n}/${TENTATIVAS}: resposta de ${buf.length} bytes, descartando`);
      await sleep(n * 3000);
      continue;
    }

    await writeFile(destino, buf);
    return { ok: true, bytes: buf.length };
  }
  return { ok: false };
}

async function principal() {
  await mkdir(dirSaida, { recursive: true });
  const falhas = [];

  for (const alvo of ALVOS) {
    const destino = path.join(dirSaida, alvo.arquivo);
    console.log(`baixando ${alvo.arquivo}`);
    const r = await baixar(alvo.url, destino);
    if (r.ok) {
      console.log(`  ok (${Math.round(r.bytes / 1024)} KB)`);
    } else {
      // Mantém o arquivo antigo: é melhor uma imagem defasada do que quebrada.
      console.warn(`  FALHOU; mantendo a versão em cache, se existir`);
      falhas.push(alvo.arquivo);
    }
    await sleep(PAUSA_ENTRE_URLS_MS);
  }

  if (falhas.length === 0) {
    const agora = new Date().toISOString();
    await writeFile(path.join(dirSaida, 'ATUALIZADO.txt'), `${agora}\n`);
    console.log(`\ntodas as ${ALVOS.length} imagens atualizadas em ${agora}`);
  } else {
    console.log(`\nconcluído com ${falhas.length} falha(s): ${falhas.join(', ')}`);
    process.exitCode = 1;
  }
}

principal();
