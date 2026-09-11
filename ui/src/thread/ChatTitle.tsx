import { useState } from 'react';
import { Icon } from '../icons/Icon';
import { usePopover } from '../overlay/usePopover';
import { createDraft, openThread, useThread } from './store';

export function ChatTitle({ title }: { title: string }) {
    const { open, setOpen, ref } = usePopover();
    const [search, setSearch] = useState('');
    const { threads, currentId } = useThread();
    const chats = threads.filter((thread) => thread.type === 'chat' && thread.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
        .sort((a, b) => b.updated.localeCompare(a.updated));
    return <div className="chat-picker" ref={ref}>
        <button className="chat-title" aria-label={`切换对话：${title}`} aria-expanded={open} onClick={() => { setSearch(''); setOpen(!open); }}>
            <span className="clip">{title}</span><Icon name="chev" size={14} />
        </button>
        {open && <div className="chat-history" aria-label="对话历史">
            <input className="field-input" autoFocus type="search" aria-label="搜索对话" placeholder="搜索对话" value={search} onChange={(event) => setSearch(event.target.value)} />
            <button className="chat-create" onClick={() => { createDraft(); setOpen(false); }}><Icon name="compose" size={16} />新对话</button>
            <div className="chat-history-list">
                {chats.map((chat) => <button className={`chat-history-row${currentId === chat.id ? ' on' : ''}`} key={chat.id} onClick={() => { void openThread(chat.id); setOpen(false); }}>
                    <span className="clip">{chat.title}</span><time>{new Date(chat.updated).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}</time>
                </button>)}
                {!chats.length && <div className="chat-history-empty">{search ? '没有匹配的对话' : '还没有历史对话'}</div>}
            </div>
        </div>}
    </div>;
}
