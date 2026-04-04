import { CATEGORIES } from "../data";

export function CategoryPicker({ current, catSearch, setCatSearch, onSelect }) {
  const filtered = catSearch
    ? Object.values(CATEGORIES).flat().filter(c => c.includes(catSearch))
    : null;

  return (
    <div style={{ marginTop:8 }}>
      <input
        value={catSearch}
        onChange={e => setCatSearch(e.target.value)}
        placeholder="חפש סעיף..."
        style={{ width:"100%", background:"var(--surface)", border:`1px solid ${"var(--border)"}`, borderRadius:8, padding:"7px 12px", color:"var(--text)", fontSize:14, fontFamily:"inherit", outline:"none", marginBottom:8, boxSizing:"border-box" }}
      />
      {filtered ? (
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", maxHeight:150, overflowY:"auto" }}>
          {filtered.map(cat => (
            <button key={cat} onClick={e => { e.stopPropagation(); onSelect(cat); }}
              style={{ padding:"5px 13px", borderRadius:16, fontSize:13, cursor:"pointer", fontFamily:"inherit",
                border:`1px solid ${current===cat?"var(--green-mid)":"var(--border)"}`,
                background:current===cat?"rgba(79,142,247,0.15)":"var(--surface2)",
                color:current===cat?"var(--green-mid)":"var(--text)", fontWeight:current===cat?700:400 }}>
              {cat}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ maxHeight:260, overflowY:"auto" }}>
          {Object.entries(CATEGORIES).map(([group, cats]) => (
            <div key={group} style={{ marginBottom:10 }}>
              <div style={{ fontSize:12, color:"var(--text-dim)", fontWeight:700, marginBottom:5, padding:"0 2px" }}>{group}</div>
              <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                {cats.map(cat => (
                  <button key={cat} onClick={e => { e.stopPropagation(); onSelect(cat); }}
                    style={{ padding:"4px 11px", borderRadius:14, fontSize:13, cursor:"pointer", fontFamily:"inherit",
                      border:`1px solid ${current===cat?"var(--green-mid)":"var(--border)"}`,
                      background:current===cat?"rgba(79,142,247,0.15)":"var(--surface2)",
                      color:current===cat?"var(--green-mid)":"var(--text)", fontWeight:current===cat?700:400 }}>
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
