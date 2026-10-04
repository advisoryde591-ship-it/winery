# vendor

`bg-removal.js` is an esbuild bundle of [`@imgly/background-removal`](https://github.com/imgly/background-removal-js) 1.4.5 together with `onnxruntime-web` 1.17, used for the "רקע נקי" button. It runs entirely in the browser; the model and WASM files are fetched on first use from `staticimgly.com/@imgly/background-removal-data/1.4.5/`.

`@imgly/background-removal` is licensed under the GNU AGPL-3.0. `onnxruntime-web` is MIT-licensed.

Rebuild:

```sh
npm i @imgly/background-removal@1.4.5 esbuild
echo 'export { removeBackground } from "@imgly/background-removal";' > entry.js
npx esbuild entry.js --bundle --format=esm --minify --platform=browser --outfile=bg-removal.js
```
