import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as deck from "../node_modules/@letele/playing-cards/dist/index.esm.js";

const outDir = fileURLToPath(new URL("../public/cards/", import.meta.url));

const suits = [
  { app: "clubs", component: "C" },
  { app: "diamonds", component: "D" },
  { app: "hearts", component: "H" },
  { app: "spades", component: "S" },
];

const ranks = [
  { app: "J", component: "j" },
  { app: "Q", component: "q" },
  { app: "K", component: "k" },
];

let count = 0;
for (const suit of suits) {
  for (const rank of ranks) {
    const componentName = `${suit.component}${rank.component}`;
    const Component = deck[componentName];
    if (!Component) throw new Error(`Missing card component ${componentName}`);
    const markup = renderToStaticMarkup(
      React.createElement(Component, {
        width: 240,
        height: 336,
        role: "img",
        "aria-label": `${rank.app} ${suit.app}`,
      }),
    );
    await writeFile(join(outDir, `${suit.app}-${rank.app}.svg`), `${markup}\n`, "utf8");
    count += 1;
  }
}

console.log(`Imported ${count} classic court card SVGs from @letele/playing-cards.`);
