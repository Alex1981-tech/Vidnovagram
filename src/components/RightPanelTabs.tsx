import type { Dispatch, MutableRefObject, SetStateAction } from 'react'

export type RpTab = 'notes' | 'quick' | 'lab' | 'clients' | 'card'

interface Props {
  tabs: RpTab[]
  setTabs: Dispatch<SetStateAction<RpTab[]>>
  activeTab: RpTab
  onTabClick: (tab: RpTab) => void
  dragTabRef: MutableRefObject<RpTab | null>
}

const TAB_LABEL: Record<RpTab, string> = {
  notes: 'Нотатки',
  quick: 'Шаблони',
  clients: 'Контакти',
  card: 'Картка клієнта',
  lab: 'Аналізи',
}

const TAB_LABEL_SHORT: Record<RpTab, string> = {
  notes: 'Нотатки',
  quick: 'Шаблони',
  clients: 'Контакти',
  card: 'Картка',
  lab: 'Аналізи',
}

function TabIcon({ tab }: { tab: RpTab }) {
  switch (tab) {
    case 'notes':
      return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
    case 'quick':
      return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
    case 'clients':
      return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    case 'card':
      return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M9 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M15 8h4M15 12h4"/><path d="M3 21v0c0-2.21 2.69-4 6-4s6 1.79 6 4"/></svg>
    case 'lab':
      return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 2v6a2 2 0 002 2h10M3 8v12a2 2 0 002 2h14a2 2 0 002-2V8"/><path d="M10 12h4M10 16h4"/></svg>
  }
}

/** Vertical tab selector for the right panel. Supports drag-to-reorder (persists to localStorage). */
export function RightPanelTabs({ tabs, setTabs, activeTab, onTabClick, dragTabRef }: Props) {
  return (
    <div className="right-panel-tabs">
      {tabs.map(tab => (
        <button
          key={tab}
          className={`rp-tab ${activeTab === tab ? 'active' : ''}`}
          data-tab={tab}
          onClick={() => onTabClick(tab)}
          title={TAB_LABEL[tab]}
          draggable
          onDragStart={e => { dragTabRef.current = tab; e.dataTransfer.effectAllowed = 'move' }}
          onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
          onDrop={e => {
            e.preventDefault()
            if (dragTabRef.current && dragTabRef.current !== tab) {
              setTabs(prev => {
                const arr = [...prev]
                const fi = arr.indexOf(dragTabRef.current as RpTab)
                const ti = arr.indexOf(tab)
                if (fi < 0 || ti < 0) return prev
                const [moved] = arr.splice(fi, 1)
                arr.splice(ti, 0, moved)
                try { localStorage.setItem('rp-tab-order', JSON.stringify(arr)) } catch {}
                return arr
              })
            }
            dragTabRef.current = null
          }}
          onDragEnd={() => { dragTabRef.current = null }}
        >
          <TabIcon tab={tab} />
          <span className="rp-tab-label">{TAB_LABEL_SHORT[tab]}</span>
        </button>
      ))}
    </div>
  )
}
