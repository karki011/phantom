// Author: Subash Karki
import { createSignal, createEffect, onMount, onCleanup, Show } from 'solid-js';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import {
	Bold,
	Italic,
	Strikethrough,
	Code,
	Heading1,
	Heading2,
	Heading3,
	List,
	ListOrdered,
	CheckSquare,
	Quote,
	FileCode,
	Minus,
} from 'lucide-solid';
import * as styles from './TipTapEditor.css';

export interface TipTapEditorProps {
	content?: string;
	onChange?: (html: string) => void;
	onInput?: (text: string) => void;
	onSubmit?: (text: string) => void;
	placeholder?: string;
	autoFocus?: boolean;
	readOnly?: boolean;
	disabled?: boolean;
	toolbar?: boolean;
	clearOnSubmit?: boolean;
	class?: string;
	fontSize?: number;
	initialValue?: string;
}

interface FormatState {
	bold: boolean;
	italic: boolean;
	strike: boolean;
	code: boolean;
	heading1: boolean;
	heading2: boolean;
	heading3: boolean;
	bulletList: boolean;
	orderedList: boolean;
	taskList: boolean;
	blockquote: boolean;
	codeBlock: boolean;
}

const INITIAL_FORMAT_STATE: FormatState = {
	bold: false,
	italic: false,
	strike: false,
	code: false,
	heading1: false,
	heading2: false,
	heading3: false,
	bulletList: false,
	orderedList: false,
	taskList: false,
	blockquote: false,
	codeBlock: false,
};

function readFormatState(editor: Editor): FormatState {
	return {
		bold: editor.isActive('bold'),
		italic: editor.isActive('italic'),
		strike: editor.isActive('strike'),
		code: editor.isActive('code'),
		heading1: editor.isActive('heading', { level: 1 }),
		heading2: editor.isActive('heading', { level: 2 }),
		heading3: editor.isActive('heading', { level: 3 }),
		bulletList: editor.isActive('bulletList'),
		orderedList: editor.isActive('orderedList'),
		taskList: editor.isActive('taskList'),
		blockquote: editor.isActive('blockquote'),
		codeBlock: editor.isActive('codeBlock'),
	};
}

export function TipTapEditor(props: TipTapEditorProps) {
	let contentRef!: HTMLDivElement;
	const [editor, setEditor] = createSignal<Editor | null>(null);
	const [format, setFormat] = createSignal<FormatState>(INITIAL_FORMAT_STATE);

	let lastEmittedHtml = props.content ?? props.initialValue ?? '';

	onMount(() => {
		const initialContent = props.content ?? props.initialValue ?? '';
		const ed = new Editor({
			element: contentRef,
			extensions: [
				StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
				TaskList,
				TaskItem.configure({ nested: true }),
				Placeholder.configure({
					placeholder: props.placeholder ?? 'Start typing...',
				}),
				Link.configure({ openOnClick: false, autolink: true }),
			],
			content: initialContent,
			editable: !props.readOnly && !props.disabled,
			onUpdate: ({ editor: e }) => {
				const html = e.getHTML();
				lastEmittedHtml = html;
				props.onChange?.(html);
				props.onInput?.(e.getText());
			},
			editorProps: {
				handleKeyDown: (_view, event) => {
					if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
						event.preventDefault();
						const text = ed.getText();
						if (!text.trim()) return true;
						props.onSubmit?.(text);
						if (props.clearOnSubmit !== false && props.clearOnSubmit !== undefined) {
							ed.commands.clearContent();
						}
						return true;
					}
					return false;
				},
			},
		});

		const updateFormat = () => setFormat(readFormatState(ed));
		ed.on('selectionUpdate', updateFormat);
		ed.on('transaction', updateFormat);

		setEditor(ed);

		if (props.autoFocus) {
			queueMicrotask(() => ed.commands.focus());
		}
	});

	onCleanup(() => {
		editor()?.destroy();
	});

	// Sync external content prop changes
	createEffect(() => {
		const ed = editor();
		const incoming = props.content ?? '';
		if (ed && incoming !== lastEmittedHtml) {
			lastEmittedHtml = incoming;
			ed.commands.setContent(incoming);
		}
	});

	createEffect(() => {
		const ed = editor();
		if (ed) ed.setEditable(!props.readOnly && !props.disabled);
	});

	const btnClass = (active: boolean) =>
		active
			? `${styles.toolbarButton} ${styles.toolbarButtonActive}`
			: styles.toolbarButton;

	const run = (fn: () => void) => (e: MouseEvent) => {
		e.preventDefault();
		fn();
	};

	return (
		<div
			class={`${styles.editorContainer} ${props.class ?? ''}`}
			style={props.fontSize ? { 'font-size': `${props.fontSize}px` } : undefined}
		>
			<Show when={props.toolbar !== false}>
				<div class={styles.editorToolbar} role="toolbar" aria-label="Text formatting">
					{/* Inline formatting */}
					<button
						class={btnClass(format().bold)}
						title="Bold"
						aria-label="Bold"
						aria-pressed={format().bold}
						onMouseDown={run(() => editor()?.chain().focus().toggleBold().run())}
					>
						<Bold size={15} />
					</button>
					<button
						class={btnClass(format().italic)}
						title="Italic"
						aria-label="Italic"
						aria-pressed={format().italic}
						onMouseDown={run(() => editor()?.chain().focus().toggleItalic().run())}
					>
						<Italic size={15} />
					</button>
					<button
						class={btnClass(format().strike)}
						title="Strikethrough"
						aria-label="Strikethrough"
						aria-pressed={format().strike}
						onMouseDown={run(() => editor()?.chain().focus().toggleStrike().run())}
					>
						<Strikethrough size={15} />
					</button>
					<button
						class={btnClass(format().code)}
						title="Inline Code"
						aria-label="Code"
						aria-pressed={format().code}
						onMouseDown={run(() => editor()?.chain().focus().toggleCode().run())}
					>
						<Code size={15} />
					</button>

					<div class={styles.toolbarDivider} />

					{/* Headings */}
					<button
						class={btnClass(format().heading1)}
						title="Heading 1"
						aria-label="Heading 1"
						aria-pressed={format().heading1}
						onMouseDown={run(() => editor()?.chain().focus().toggleHeading({ level: 1 }).run())}
					>
						<Heading1 size={15} />
					</button>
					<button
						class={btnClass(format().heading2)}
						title="Heading 2"
						aria-label="Heading 2"
						aria-pressed={format().heading2}
						onMouseDown={run(() => editor()?.chain().focus().toggleHeading({ level: 2 }).run())}
					>
						<Heading2 size={15} />
					</button>
					<button
						class={btnClass(format().heading3)}
						title="Heading 3"
						aria-label="Heading 3"
						aria-pressed={format().heading3}
						onMouseDown={run(() => editor()?.chain().focus().toggleHeading({ level: 3 }).run())}
					>
						<Heading3 size={15} />
					</button>

					<div class={styles.toolbarDivider} />

					{/* Lists */}
					<button
						class={btnClass(format().bulletList)}
						title="Bullet List"
						aria-label="Bullet list"
						aria-pressed={format().bulletList}
						onMouseDown={run(() => editor()?.chain().focus().toggleBulletList().run())}
					>
						<List size={15} />
					</button>
					<button
						class={btnClass(format().orderedList)}
						title="Ordered List"
						aria-label="Ordered list"
						aria-pressed={format().orderedList}
						onMouseDown={run(() => editor()?.chain().focus().toggleOrderedList().run())}
					>
						<ListOrdered size={15} />
					</button>
					<button
						class={btnClass(format().taskList)}
						title="Task List"
						aria-label="Task list"
						aria-pressed={format().taskList}
						onMouseDown={run(() => editor()?.chain().focus().toggleTaskList().run())}
					>
						<CheckSquare size={15} />
					</button>

					<div class={styles.toolbarDivider} />

					{/* Block formatting */}
					<button
						class={btnClass(format().blockquote)}
						title="Blockquote"
						aria-label="Blockquote"
						aria-pressed={format().blockquote}
						onMouseDown={run(() => editor()?.chain().focus().toggleBlockquote().run())}
					>
						<Quote size={15} />
					</button>
					<button
						class={btnClass(format().codeBlock)}
						title="Code Block"
						aria-label="Code block"
						aria-pressed={format().codeBlock}
						onMouseDown={run(() => editor()?.chain().focus().toggleCodeBlock().run())}
					>
						<FileCode size={15} />
					</button>
					<button
						class={styles.toolbarButton}
						title="Horizontal Rule"
						aria-label="Horizontal rule"
						onMouseDown={run(() => editor()?.chain().focus().setHorizontalRule().run())}
					>
						<Minus size={15} />
					</button>
				</div>
			</Show>
			<div ref={contentRef} />
		</div>
	);
}
