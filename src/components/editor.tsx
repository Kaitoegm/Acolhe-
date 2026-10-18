'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import CharacterCount from '@tiptap/extension-character-count';
import { Extension, getText, getTextSerializersFromSchema } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import type { Draft, CatalogItem } from '@/lib/contracts';
const PlainTextLimit = Extension.create({
    name: 'plainTextLimit',
    addProseMirrorPlugins() {
        return [new Plugin({ filterTransaction(transaction) {
            if (!transaction.docChanged) return true;
            return getText(transaction.doc, { blockSeparator: '\n', textSerializers: getTextSerializersFromSchema(transaction.doc.type.schema) }).length <= 4000;
        } })];
    },
});
export function ClinicalEditor({ draft, onChange, disabled }: {
    draft: Draft;
    onChange: (text: string, document: Record<string, unknown>) => void;
    disabled: boolean;
}) {
    const callback = useRef(onChange);
    callback.current = onChange;
    const editor = useEditor({ extensions: [StarterKit, CharacterCount.configure({ limit: 4000 }), PlainTextLimit], immediatelyRender: false, content: draft.document || { type: 'doc', content: draft.text.split('\n').map(text => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })) }, editable: !disabled, editorProps: { attributes: { 'aria-label': 'Descrição da escuta inicial', role: 'textbox', 'aria-multiline': 'true' } }, onUpdate: ({ editor }) => callback.current(editor.getText({ blockSeparator: '\n' }), editor.getJSON()) });
    useEffect(() => { editor?.setEditable(!disabled, false); }, [editor, disabled]);
    useEffect(() => { if (editor && editor.getText({ blockSeparator: '\n' }) !== draft.text)
        editor.commands.setContent(draft.document || { type: 'doc', content: draft.text.split('\n').map(text => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })) }, { emitUpdate: false }); }, [editor, draft.text, draft.document]);
    if (!editor)
        return <div className="editor-loading">Preparando editor…</div>;
    const tools = [{ label: 'Negrito', text: 'B', active: editor.isActive('bold'), action: () => editor.chain().focus().toggleBold().run() }, { label: 'Itálico', text: 'I', active: editor.isActive('italic'), action: () => editor.chain().focus().toggleItalic().run() }, { label: 'Sublinhado', text: 'U', active: editor.isActive('underline'), action: () => editor.chain().focus().toggleUnderline().run() }, { label: 'Tachado', text: 'S', active: editor.isActive('strike'), action: () => editor.chain().focus().toggleStrike().run() }, { label: 'Lista com marcadores', text: '• ≡', active: editor.isActive('bulletList'), action: () => editor.chain().focus().toggleBulletList().run() }, { label: 'Lista numerada', text: '1. ≡', active: editor.isActive('orderedList'), action: () => editor.chain().focus().toggleOrderedList().run() }, { label: 'Desfazer', text: '↶', action: () => editor.chain().focus().undo().run() }, { label: 'Refazer', text: '↷', action: () => editor.chain().focus().redo().run() }, { label: 'Limpar formatação', text: 'Tx', action: () => editor.chain().focus().unsetAllMarks().clearNodes().run() }];
    return <div className={'editor ' + (disabled ? 'read-only' : '')}><div className="editor-toolbar" role="toolbar" aria-label="Formatação do registro">{tools.map(t => <button type="button" key={t.label} title={t.label} aria-label={t.label} aria-pressed={t.active} disabled={disabled} className={t.active ? 'active' : ''} onClick={t.action}>{t.text}</button>)}</div><EditorContent editor={editor}/><div className="editor-count">{draft.text.length.toLocaleString('pt-BR')} / 4.000 caracteres</div></div>;
}
export function CatalogSelect({label,items,value,onSelect,disabled,placeholder}:{label:string;items:CatalogItem[];value?:string;onSelect:(code:string)=>void;disabled?:boolean;placeholder?:string}) {
 const[query,setQuery]=useState(''),[open,setOpen]=useState(false),[active,setActive]=useState(0);const listId=useId();const selected=items.find(i=>i.code===value);const shown=items.filter(i=>(i.code+' '+i.label).toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))).slice(0,30);
 function choose(code:string){onSelect(code);setOpen(false);setQuery('');}
 return <div className="catalog"><label>{label}<input disabled={disabled} role="combobox" aria-controls={listId} aria-expanded={open} aria-autocomplete="list" aria-activedescendant={open&&shown[active]?listId+'-'+active:undefined} placeholder={placeholder||'Digite o código ou a descrição'} value={open?query:selected?selected.code+' — '+selected.label:value||''} onChange={e=>{setQuery(e.target.value);setOpen(true);setActive(0);}} onFocus={()=>{setQuery('');setOpen(true);setActive(0);}} onBlur={()=>setOpen(false)} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();setOpen(false);}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setOpen(true);setActive(current=>Math.max(0,Math.min(shown.length-1,current+(e.key==='ArrowDown'?1:-1))));}if(e.key==='Enter'&&open){e.preventDefault();if(shown[active])choose(shown[active].code);}}}/></label>{open&&!disabled&&<div id={listId} className="catalog-options" role="listbox" aria-label={label}>{shown.length?shown.map((item,index)=><button id={listId+'-'+index} tabIndex={-1} type="button" role="option" className={active===index?'active':''} aria-selected={active===index} key={item.code} onMouseDown={e=>e.preventDefault()} onMouseEnter={()=>setActive(index)} onClick={()=>choose(item.code)}><strong>{item.code}</strong> {item.label}</button>):<p>Nenhum resultado no catálogo disponível.</p>}</div>}</div>;
}

