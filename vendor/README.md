# vendor

`bg-removal.js` is an esbuild bundle of [`@imgly/background-removal`](https://github.com/imgly/background-removal-js) 1.4.5 together with `onnxruntime-web` 1.17, used for the "רקע נקי" button. It runs entirely in the browser; the model and WASM files are fetched on first use from `staticimgly.com/@imgly/background-removal-data/1.4.5/`.

`@imgly/background-removal` is licensed under the GNU AGPL-3.0. `onnxruntime-web` is MIT-licensed.

Rebuild:

```sh
npm i @imgly/background-removal@1.4.5 esbuild
echo 'export { removeBackground } from "@imgly/background-removal";' > entry.js
npx esbuild entry.js --bundle --format=esm --minify --platform=browser --outfile=bg-removal.js
```

`firebase.js` is an esbuild bundle of the [Firebase JS SDK](https://github.com/firebase/firebase-js-sdk) 12.19.0 (app + Firestore only), Apache-2.0, used for the shared cellar sync in `sync.js`.

```sh
npm i firebase@12.19.0 esbuild
cat > entry.js <<'X'
export { initializeApp } from 'firebase/app';
export { initializeFirestore, connectFirestoreEmulator, collection, doc, setDoc, deleteDoc, onSnapshot, getDocs, writeBatch, persistentLocalCache, memoryLocalCache } from 'firebase/firestore';
X
npx esbuild entry.js --bundle --format=esm --minify --platform=browser --outfile=firebase.js
```
