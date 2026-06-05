import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const baseUrl = "https://webisso.github.io/playing-cards";
const outDir = fileURLToPath(new URL("../public/cards/", import.meta.url));

const suitMap = {
  clubs: "clubs",
  diamonds: "diamonds",
  hearts: "hearts",
  spades: "spades",
};

const rankMap = {
  ace: "A",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  "10": "10",
  jack: "J",
  queen: "Q",
  king: "K",
};

async function downloadText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }
  return response.text();
}

await mkdir(outDir, { recursive: true });

const manifest = JSON.parse(await downloadText(`${baseUrl}/cards.json`));
let count = 0;

for (const [sourceSuit, ranks] of Object.entries(manifest.cards)) {
  if (!suitMap[sourceSuit]) continue;
  for (const [sourceRank, card] of Object.entries(ranks)) {
    if (!rankMap[sourceRank]) continue;
    const svg = await downloadText(`${baseUrl}/${card.svg}`);
    await writeFile(join(outDir, `${suitMap[sourceSuit]}-${rankMap[sourceRank]}.svg`), svg, "utf8");
    count += 1;
  }
}

await writeFile(
  join(outDir, "SOURCE.md"),
  `# Playing card assets

Card faces imported from Webisso Playing Cards.

- Source: https://webisso.github.io/playing-cards/
- Repository: https://github.com/webisso/playing-cards
- License: MIT

Imported files are stored with this app's existing card ids, such as \`spades-A.svg\`.
`,
  "utf8",
);

console.log(`Imported ${count} SVG card faces from Webisso Playing Cards.`);
