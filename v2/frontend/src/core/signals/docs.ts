// PhantomOS v2 — Documentation screen visibility signal
// Author: Subash Karki

import { createSignal } from 'solid-js';

const [docsVisible, setDocsVisible] = createSignal(false);

export const openDocs = () => setDocsVisible(true);
export const closeDocs = () => setDocsVisible(false);
export const toggleDocs = () => setDocsVisible((prev) => !prev);

export { docsVisible };
