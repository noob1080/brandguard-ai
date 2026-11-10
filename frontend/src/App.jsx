import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, Check, CheckCheck, ChevronDown, CircleHelp, Clock3, Copy, Download, FileText, LoaderCircle, RotateCcw, ShieldCheck, Sparkles, Upload, X } from 'lucide-react'
import { createPdfFile, createWordFile, downloadFile, safeExportName } from './exporters.js'

const DEMO_GUIDE = `Always capitalize “Midnight Owls”. The name represents our community and must never appear in lowercase.

Never say “cheap”; say “cost-effective” instead. We make thoughtful tools accessible without discounting their value.

Avoid the word “guaranteed”. Describe what the product helps people do without promising a certain outcome.

Never call a feature “revolutionary”. Use specific, grounded language that explains the practical benefit.

Our voice is warm, clear, and confident.

Avoid hype, pressure, and jargon.

Use sentence case for headings.

Never say “users”; say “members” instead when speaking about our community.

Prefer active voice and short, direct sentences.

Spell out numbers one through nine except in measurements.`

const DEMO_DRAFT = `Meet the midnight owls toolkit — a cheap, revolutionary way to organize your team's ideas. Our approach is guaranteed to save hours every week. Join thousands of users who already love it.`

const DEMO_RULES = DEMO_GUIDE.split('\n\n').filter((x)=>x.trim()).map((text,i)=>({id:`demo-rule-${i}`,text,source:'midnight-owls-brand-guide.md',chunk:i+1}))
const LOCAL_REPLACEMENTS = { cheap:'affordable', guaranteed:'designed to', guarantee:'help', guarantees:'claims to help', revolutionary:'a specific, grounded description', users:'members', user:'member' }

function localChunks(text,source){return text.split(/\n\s*\n|\n/).map(s=>s.trim().replace(/^[-*#\s]+/, '')).filter(Boolean).map((text,i)=>({id:`local-${i}`,text,source,chunk:i+1}))}

function localAnalysis(draft,guides){
  const findings=[];const seen=new Set()
  const add=(category,severity,match,suggested,explanation,guide)=>{const key=`${match.index}:${match[0].toLowerCase()}`;if(seen.has(key))return;seen.add(key);findings.push({id:key,category,severity,original_text:match[0],suggested_text:suggested,explanation,guideline:guide.text,source:`${guide.source} · rule ${guide.chunk}`,start:match.index,end:match.index+match[0].length})}
  for(const guide of guides){const text=guide.text
    const bannedRule=text.match(/(?:never\s+(?:say|use)(?:\s+the\s+word)?|avoid(?:\s+the\s+word)?|never\s+call\s+(?:a\s+\w+\s+)?)[\s"'“‘]*([\w-]+)/i)||text.match(/never\s+(?:promise|claim|guarantee)\s+(?:\d{1,3}%\s+)?["'“‘]*([\w-]+)/i)
    if(bannedRule){const banned=bannedRule[1];const tail=text.slice(bannedRule.index+bannedRule[0].length);const alternative=tail.match(/(?:;|,)\s*(?:instead\s+)?(?:say|use|write|prefer)\s+["'“‘]*([\w-]+)|\b(?:say|use|write|prefer)\s+["'“‘]*([\w-]+)\s+(?:instead|rather than|in place of)\b|\binstead\s*,?\s*(?:say|use|write|prefer)\s+["'“‘]*([\w-]+)/i);const termPattern=banned.toLowerCase().startsWith('guarantee')?/\bguarantee(?:s|d)?\b/ig:new RegExp(`\\b${banned.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'ig');const suggested=alternative?.[1]||alternative?.[2]||alternative?.[3]||LOCAL_REPLACEMENTS[banned.toLowerCase()]||'a more specific description';for(const m of draft.matchAll(termPattern))add('Terminology',alternative?'high':'medium',m,suggested,`Use “${suggested}” in place of “${m[0]}” to follow this approved rule.`,guide)}
    const capRule=text.match(/always\s+(?:capitalize|capitalise|write|use)\s+["'“‘]?([^"'”’;,.]+?)["'”’]?(?:\.|$)/i)
    if(capRule){const canonical=capRule[1].trim();if(/[A-Z]/.test(canonical))for(const m of draft.matchAll(new RegExp(canonical.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi')))if(m[0]!==canonical)add('Capitalization','medium',m,canonical,`Write the name as “${canonical}” every time.`,guide)}
  }
  findings.sort((a,b)=>a.start-b.start)
  return findings
}

function App() {
  const [draft,setDraft]=useState(()=>localStorage.getItem('rulebook-draft')??'')
  const [findings,setFindings]=useState([])
  const [decisions,setDecisions]=useState({})
  const [rules,setRules]=useState(DEMO_RULES)
  const [filename,setFilename]=useState('midnight-owls-brand-guide.md')
  const [status,setStatus]=useState('ready')
  const [engine,setEngine]=useState('browser-demo')
  const [backendAvailable,setBackendAvailable]=useState(false)
  const [error,setError]=useState('')
  const [draftName,setDraftName]=useState('Draft Workspace')
  const [finalOutputEdited,setFinalOutputEdited]=useState(false)
  const [isDraggingScript,setIsDraggingScript]=useState(false)
  const [notice,setNotice]=useState('')
  const [demoMode,setDemoMode]=useState(true)
  const [openMenu,setOpenMenu]=useState('')
  const [showHelp,setShowHelp]=useState(false)
  const draftFileRef=useRef(null)
  const draftRef=useRef(null)
  const textareaRef=useRef(null)

  useEffect(()=>{
    const closeOnOutside=(event)=>{if(!event.target.closest('[data-popover-root]'))setOpenMenu('')}
    const closeOnEscape=(event)=>{if(event.key==='Escape'){setOpenMenu('');setShowHelp(false)}}
    document.addEventListener('pointerdown',closeOnOutside)
    document.addEventListener('keydown',closeOnEscape)
    return()=>{document.removeEventListener('pointerdown',closeOnOutside);document.removeEventListener('keydown',closeOnEscape)}
  },[])

  useEffect(()=>{localStorage.setItem('rulebook-draft',draft)},[draft])
  useEffect(()=>{ fetch('/api/health').then(async r=>{if(!r.ok)return null;const health=await r.json();if(!health?.ok)return null;setBackendAvailable(true);return fetch('/api/guidelines')}).then(r=>r?.ok?r.json():null).then(d=>{if(d?.guidelines?.length){setRules(d.guidelines);setFilename(d.guidelines[0].source);setDemoMode(false)}}).catch(()=>{}) },[])

  const decidedCount=Object.keys(decisions).length
  const acceptedCount=Object.values(decisions).filter(x=>x==='accepted').length
  const pendingFindings=findings.filter(f=>!decisions[f.id])
  const reviewedFindings=findings.filter(f=>decisions[f.id])
  const score=useMemo(()=>Math.max(0,100-findings.reduce((sum,f)=>sum+(decisions[f.id]==='accepted'?0:f.severity==='high'?20:f.severity==='medium'?12:5),0)),[findings,decisions])
  const words=draft.trim()?draft.trim().split(/\s+/).length:0

  function loadDemo(){setDemoMode(true);setRules(DEMO_RULES);setFilename('midnight-owls-brand-guide.md');setDraft(DEMO_DRAFT);setDraftName('Draft Workspace');setFindings([]);setDecisions({});setFinalOutputEdited(false);setError('');setStatus('ready');setNotice('Sample workspace restored — try analyzing the draft.')}

  function jumpToDraft(){setOpenMenu('');draftRef.current?.scrollIntoView({behavior:'smooth',block:'center'});textareaRef.current?.focus()}
  function jumpToGuidelines(){setOpenMenu('');document.querySelector('.guidelines-panel')?.scrollIntoView({behavior:'smooth',block:'center'})}
  async function copyText(value,label){try{await navigator.clipboard.writeText(value);setOpenMenu('');setNotice(`${label} copied to clipboard.`)}catch{setOpenMenu('');setNotice(`Copy isn’t available here. Select the ${label.toLowerCase()} and copy it manually.`)}}
  function resetDemo(){if(window.confirm('Replace the current draft and guide with the sample workspace?'))loadDemo();setOpenMenu('')}

  async function uploadGuide(file){
    if(!file)return
    setError('');setNotice('')
    if(!/\.(txt|md)$/i.test(file.name)){setError('Choose a .txt or .md guideline file.');return}
    if(file.size>1_000_000){setError('Keep guideline files under 1 MB.');return}
    setStatus('uploading')
    if(!backendAvailable){try{const text=await file.text();if(!text.trim())throw new Error('The guide looks empty.');const chunks=localChunks(text,file.name);setRules(chunks);setFilename(file.name);setDemoMode(false);setFindings([]);setDecisions({});setStatus('ready');setNotice(`${chunks.length} guideline sections loaded in this browser.`)}catch(e){setError(e.message);setStatus('ready')}return}
    const form=new FormData();form.append('file',file)
    try { const res=await fetch('/api/ingest',{method:'POST',body:form}); const data=await res.json();if(!res.ok)throw new Error(data.detail||'Could not upload this guide.');setRules(data.guidelines);setFilename(data.filename);setDemoMode(false);setFindings([]);setDecisions({});setStatus('ready');setNotice(`${data.chunks_indexed} guideline sections are ready to review.`) }
    catch(e){if(e instanceof TypeError&&e.message==='Failed to fetch'){try{const text=await file.text();if(!text.trim())throw new Error('The guide looks empty.');const chunks=localChunks(text,file.name);setRules(chunks);setFilename(file.name);setDemoMode(false);setFindings([]);setDecisions({});setStatus('ready');setNotice(`${chunks.length} guideline sections loaded in this browser.`)}catch(readError){setError(readError.message||'Could not read this guideline file.');setStatus('ready')}}else{setError(e.message||'Could not index this guideline file.');setStatus('ready')}}
  }

  async function uploadScript(file){
    if(!file)return
    setError('');setNotice('')
    setStatus('uploading')
    try{if(!/\.(txt|md)$/i.test(file.name))throw new Error('Choose a .txt or .md script file.');if(file.size>1_000_000)throw new Error('Keep script files under 1 MB.');const text=await file.text();if(!text.trim())throw new Error('This script file is empty.');setDraft(text);setDraftName(file.name.replace(/\.[^.]+$/,'')||'Draft Workspace');setFindings([]);setDecisions({});setNotice(`${file.name} is ready to review.`)}catch(e){setError(e.message||'Could not read this script file.')}finally{setStatus('ready');setOpenMenu('')}
  }

  function handleScriptDrop(event){event.preventDefault();setIsDraggingScript(false);uploadScript(event.dataTransfer.files?.[0])}

  function clearDraft(){setDraft('');setDraftName('Draft Workspace');setFindings([]);setDecisions({});setFinalOutputEdited(false);setStatus('ready');setError('');setNotice('Draft cleared.');setOpenMenu('')}

  function exportFinalText(){downloadFile(new Blob(['\ufeff',draft],{type:'text/plain;charset=utf-8'}),`${safeExportName(draftName)}.txt`)}
  function exportFinalWord(){downloadFile(createWordFile(draft),`${safeExportName(draftName)}.docx`)}
  function exportFinalPdf(){downloadFile(createPdfFile(draft),`${safeExportName(draftName)}.pdf`)}

  async function analyzeDraft(){
    if(!draft.trim())return
    setError('');setNotice('');setStatus('analyzing');setDecisions({});setFinalOutputEdited(false)
    if(demoMode){await new Promise(r=>setTimeout(r,250));setFindings(localAnalysis(draft,rules));setEngine('browser-demo');setStatus('complete');return}
    if(!backendAvailable){setFindings(localAnalysis(draft,rules));setEngine('browser-local');setStatus('complete');return}
    try { const res=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({draft,top_k:3})});const data=await res.json();if(!res.ok)throw new Error(data.detail||'Analysis failed.');setFindings(data.findings);setEngine(data.engine||'chromadb-rules');setStatus('complete') }
    catch(e){if(e.message==='Failed to fetch'){setFindings(localAnalysis(draft,rules));setEngine('browser-local');setStatus('complete');setNotice('Checked in this browser because FastAPI could not be reached.')}else{setError(e.message);setStatus('ready')}}
  }

  function decide(finding,decision){
    setDecisions(prev=>({...prev,[finding.id]:decision}))
    if(decision==='accepted'){
      setDraft(prev=>{
        const current=prev.slice(finding.start,finding.end)
        if(current.toLowerCase()===finding.original_text.toLowerCase())return prev.slice(0,finding.start)+finding.suggested_text+prev.slice(finding.end)
        const idx=prev.toLowerCase().indexOf(finding.original_text.toLowerCase())
        return idx<0?prev:prev.slice(0,idx)+finding.suggested_text+prev.slice(idx+finding.original_text.length)
      })
    }
  }

  function applyAll(){
    const pending=findings.filter(f=>!decisions[f.id]).sort((a,b)=>b.start-a.start)
    let next=draft
    pending.forEach(f=>{const current=next.slice(f.start,f.end);if(current.toLowerCase()===f.original_text.toLowerCase())next=next.slice(0,f.start)+f.suggested_text+next.slice(f.end)})
    setDraft(next);setDecisions(prev=>({...prev,...Object.fromEntries(pending.map(f=>[f.id,'accepted']))}))
  }

  function resetReview(){setFindings([]);setDecisions({});setFinalOutputEdited(false);setStatus('ready');setError('')}
  function undoDecision(finding){if(decisions[finding.id]==='accepted'){setDraft(prev=>{const at=prev.indexOf(finding.suggested_text);return at<0?prev:prev.slice(0,at)+finding.original_text+prev.slice(at+finding.suggested_text.length)})}setDecisions(prev=>{const next={...prev};delete next[finding.id];return next})}

  const resultMessage=decidedCount===findings.length&&findings.length>0?'Review complete — your final say is what counts.':`${findings.length} suggestions are ready for your review.`

  const guidelinesPanel=<section className="guidelines-panel" aria-label="Approved guidelines"><div className="guidelines-head"><span className="step-index">01</span><span className="section-label">APPROVED GUIDELINES</span><span className="rules-count">{rules.length} rules</span></div><div className="guidelines-content">{rules.length?<><div className="guide-file"><div className="guide-file-icon"><FileText size={17}/></div><div className="guide-file-info"><strong>{filename}</strong><span>{demoMode?'Approved sample guide':'Approved brand guide'} <span>·</span> {rules.length} rules</span></div><span className="file-ready"><Check size={13}/> Active</span></div><div className="rules-scroll" role="region" aria-label="All approved brand rules" tabIndex="0">{rules.map((r,i)=><div className="rule-line" key={r.id}><span className="rule-number">{String(i+1).padStart(2,'0')}</span><span>{r.text}</span></div>)}</div></>:<div className="empty-guide"><div className="upload-symbol"><ShieldCheck size={18}/></div><strong>No approved rules yet</strong><span>Your manager’s brand guidelines will appear here.</span></div>}</div></section>

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#top" aria-label="BrandGuard AI home"><span className="brand-mark brand-mark-image"><img src="/brandguard-owl.png" alt=""/></span><span>BrandGuard <span className="brand-ai">AI</span></span></a>
      <div className="header-nav">
        <div className="popover-anchor" data-popover-root>
          <button className="workspace-switcher" aria-expanded={openMenu==='workspace'} onClick={()=>setOpenMenu(openMenu==='workspace'?'':'workspace')}><span className="workspace-dot"/> <span className="workspace-client">Midnight Owls</span><span className="topbar-separator">/</span><span className="workspace-name">Brand workspace</span><ChevronDown size={14}/></button>
          {openMenu==='workspace'&&<div className="header-popover workspace-popover"><div className="popover-eyebrow">YOUR WORKSPACE</div><div className="workspace-current"><span className="workspace-dot"/><span><strong>Midnight Owls</strong><small>Brand review workspace</small></span><Check size={15}/></div><button onClick={jumpToDraft}><FileText size={15}/> Jump to draft <ArrowRight size={13}/></button><button onClick={jumpToGuidelines}><ShieldCheck size={15}/> Manage guidelines <ArrowRight size={13}/></button><button onClick={()=>copyText(window.location.href,'Project link')}><Copy size={15}/> Copy project link <ArrowRight size={13}/></button></div>}
        </div>
      </div>
      <div className="topbar-actions">
        <button className="icon-button help-button" title="Help and workflow guide" aria-label="Help and workflow guide" onClick={()=>{setOpenMenu('');setShowHelp(true)}}><CircleHelp size={18}/><span>Help</span></button>
        <div className="popover-anchor" data-popover-root>
          <button className="profile-button" aria-label="Open profile menu" aria-expanded={openMenu==='profile'} onClick={()=>setOpenMenu(openMenu==='profile'?'':'profile')}><span className="avatar">Y</span><ChevronDown size={13}/></button>
          {openMenu==='profile'&&<div className="header-popover profile-popover"><div className="profile-summary"><span className="avatar">Y</span><span><strong>Yashas</strong><small>Workspace owner</small></span></div><button onClick={resetDemo}><RotateCcw size={15}/> Reset sample workspace</button></div>}
        </div>
      </div>
    </header>
    <div className="page-wrap" id="top">
      <div className={`page-heading ${status==='complete'?'heading-results':'heading-compose'}`}><div><div className="eyebrow"><span className="eyebrow-line"/> AI PRECISION · HUMAN DECISION <span className="eyebrow-line"/></div><h1>Smart guardrails for<br/><em>your brand’s voice.</em></h1><p className="page-subtitle">Check a draft against approved guidelines. You make the final call.</p></div><div className="heading-badge"><span className="pulse"/> Human review enabled</div></div>
      <main className={`workspace ${status==='complete'?'is-results':'is-compose'}`}>
        {guidelinesPanel}
        <section className="editor-column" aria-label="Draft editor">
          <div className="section-topline"><div><span className="step-index">02</span><span className="section-label">YOUR DRAFT</span></div></div>
          <div className={`draft-card ${isDraggingScript?'is-dragging':''}`} ref={draftRef} onDragEnter={e=>{e.preventDefault();setIsDraggingScript(true)}} onDragOver={e=>e.preventDefault()} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget))setIsDraggingScript(false)}} onDrop={handleScriptDrop}><div className="draft-card-head"><div className="draft-title-wrap"><div className="doc-icon"><FileText size={17}/></div><div><div className="draft-title">{draftName}</div><div className="draft-meta">Content script <span>·</span> Edited just now</div></div></div><div className="draft-actions"><input ref={draftFileRef} className="visually-hidden" type="file" accept=".txt,.md,text/plain,text/markdown" aria-hidden="true" tabIndex={-1} onChange={e=>{uploadScript(e.target.files?.[0]);e.target.value=''}}/><button className="script-upload-button" onClick={()=>draftFileRef.current?.click()} disabled={status==='uploading'}>{status==='uploading'?<LoaderCircle className="spin" size={14}/>:<Upload size={14}/>} Upload script</button><button className="clear-draft-button" onClick={clearDraft} disabled={status==='uploading'}><X size={14}/> Clear draft</button></div></div><textarea ref={textareaRef} aria-label="Draft content" value={draft} onChange={e=>{setDraft(e.target.value);if(status==='complete')resetReview()}} placeholder="Paste your campaign copy here or upload a script file..."/><div className="draft-card-foot"><span>{words} words <span>·</span> {draft.length} characters</span><span className="autosave"><span/> Saved locally</span></div>{isDraggingScript&&<div className="drop-overlay"><span><Upload size={18}/> Drop a .txt or .md script</span></div>}</div>
          <div className="analyze-row"><div className="analyze-hint"><Sparkles size={15}/> Checks against your approved guide</div><button className="analyze-button" disabled={!draft.trim()||status==='analyzing'||status==='uploading'} onClick={analyzeDraft}>{status==='analyzing'?<><LoaderCircle className="spin" size={17}/> Checking draft...</>:<>Analyze draft <ArrowRight size={16}/></>}</button></div>
          {error&&<div className="error-banner" role="alert"><X size={15}/>{error}</div>}
          {notice&&<div className="notice-banner"><Check size={15}/>{notice}<button onClick={()=>setNotice('')} aria-label="Dismiss"><X size={14}/></button></div>}

          <div className="privacy-note"><ShieldCheck size={15}/><span>Your draft stays yours. No edits are made until you accept a suggestion.</span></div>
        </section>

        <aside className="review-column" aria-label="Review suggestions"><div className="section-topline review-topline">{status==='complete'&&<button className="back-to-draft" onClick={resetReview}><ArrowLeft size={14}/> Back to draft</button>}<div><span className="step-index">03</span><span className="section-label">FINDINGS & DECISIONS</span></div></div>
          {status==='complete'&&<div className={`score-card ${findings.length?'has-findings':'is-clear'}`}><div className="score-ring" style={{'--score':`${score}%`}}><div><strong>{finalOutputEdited?'—':score}</strong><span>RULE<br/>SCORE</span></div></div><div className="score-copy"><small className="score-eyebrow">{finalOutputEdited?'COPY UPDATED':findings.length?(pendingFindings.length?'REVIEW RECOMMENDED':'REVIEW COMPLETE'):'GUIDELINES CHECKED'}</small><strong>{finalOutputEdited?'Recheck to refresh your score':findings.length?(pendingFindings.length?`${pendingFindings.length} suggestion${pendingFindings.length===1?'':'s'} to review`:'All suggestions reviewed'):'No conflicts found'}</strong><span>{finalOutputEdited?'The final copy changed after analysis. Run the check again to update its score and findings.':findings.length?(pendingFindings.length?'This estimate starts at 100 and drops for rule conflicts. Accept an edit to remove that issue from the score.':'Your choices are recorded; accepted edits are applied.'):'No conflicts found in the relevant approved rules.'}</span><small className="engine-label">Checked with {engine==='openai-structured'?'AI + guideline search':engine==='chromadb-rules'?'guideline search + rule match':engine==='chromadb-fallback'?'guideline search + fallback':engine==='browser-local'?'local rule check':'sample rule check'}</small></div><div className="score-sparkle"><Sparkles size={19}/></div></div>}
          {findings.length>0&&<div className="review-actions-row"><div className="review-summary"><span>{decidedCount===findings.length?<CheckCheck size={15}/>:<Clock3 size={15}/>} {decidedCount} of {findings.length} reviewed</span>{acceptedCount>0&&<span className="accepted-count"><Check size={13}/>{acceptedCount} accepted</span>}</div>{pendingFindings.length>0&&<button className="accept-all accept-all-top" onClick={applyAll} title="Apply every pending suggestion to the draft"><CheckCheck size={15}/> Accept all {pendingFindings.length} edits</button>}</div>}
          {findings.length===0&&status!=='complete'?<div className="review-empty"><div className="empty-orbit"><div className="orbit-dot dot-a"/><div className="orbit-dot dot-b"/><div className="orbit-center"><Sparkles size={22}/></div></div><strong>Your review starts here</strong><p>Once you analyze your draft, every suggestion will appear here with the exact rule behind it.</p><div className="empty-steps"><div><span>1</span> Analyze your draft</div><ArrowDown size={13}/><div><span>2</span> Review every suggestion</div><ArrowDown size={13}/><div><span>3</span> Decide what to change</div></div><div className="human-note"><ShieldCheck size={15}/> Your judgment always comes first</div></div>:null}
          {status==='complete'&&findings.length===0?<div className="success-card"><div><CheckCheck size={20}/></div><strong>No guideline conflicts found</strong><p>Your draft matches the relevant rules. Give it a final read and you’re ready to share.</p><button onClick={analyzeDraft}>Run check again <ArrowRight size={14}/></button></div>:null}
          <div className="finding-list">{pendingFindings.map((f,index)=><article className="finding-card" key={f.id}><div className="finding-heading"><span className={`severity-dot severity-${f.severity}`}/><span className="finding-category">{f.category}</span><span className={`severity-label severity-text-${f.severity}`}>{f.severity}</span><span className="finding-number">{String(index+1).padStart(2,'0')}</span></div><p className="finding-explanation">{f.explanation}</p><div className="word-swap"><span className="word-old">{f.original_text}</span><ArrowRight size={14}/><span className="word-new">{f.suggested_text}</span></div><div className="citation"><span className="citation-mark">“</span><span><strong>From your guide</strong><br/>{f.guideline}<small className="citation-source">{f.source}</small></span></div><div className="decision-actions"><button className="reject-button" onClick={()=>decide(f,'rejected')}><X size={14}/> Reject</button><button className="accept-button" onClick={()=>decide(f,'accepted')}><Check size={14}/> Accept edit</button></div></article>)}</div>
          {reviewedFindings.length>0&&<div className="decision-log"><div className="decision-log-title">DECISIONS <span>{reviewedFindings.length}</span></div>{reviewedFindings.map(f=><div className={`decision-log-row ${decisions[f.id]}`} key={f.id}><span>{decisions[f.id]==='accepted'?<Check size={13}/>:<X size={13}/>}</span><div><strong>{decisions[f.id]==='accepted'?'Accepted':'Rejected'}</strong><small>{f.original_text}{decisions[f.id]==='accepted'?` → ${f.suggested_text}`:' · left unchanged'}</small></div><button onClick={()=>undoDecision(f)}>Undo</button></div>)}</div>}
          {findings.length>0&&decidedCount===findings.length&&<div className="review-done"><ShieldCheck size={17}/><span>Review complete. The final copy is yours.</span></div>}
          <div className="powered-note"><span className="powered-line"/> grounded in your rules <span className="powered-line"/></div>
        </aside>
        {status==='complete'&&<section className={`final-output-panel output-column ${pendingFindings.length?'output-pending':''}`} aria-labelledby="final-output-title"><div className="final-output-head"><div className="final-output-heading"><span className="final-output-icon"><CheckCheck size={19}/></span><div><div className="final-output-eyebrow">{pendingFindings.length?'LIVE OUTPUT PREVIEW':'FINAL COPY PREVIEW'}</div><h2 id="final-output-title">{pendingFindings.length?'Your draft as it stands':'Ready to use'}</h2><p>{pendingFindings.length?'Accepted edits appear here. Finish reviewing to unlock editing and export.':'Edit the reviewed copy, then export it in your preferred format.'}</p></div></div>{pendingFindings.length===0&&<div className="final-output-actions"><div className="export-menu" data-popover-root><button className="export-button export-word export-trigger" aria-haspopup="menu" aria-expanded={openMenu==='export'} onClick={()=>setOpenMenu(openMenu==='export'?'':'export')}><Download size={16}/> Export final copy <ChevronDown size={15}/></button>{openMenu==='export'&&<div className="export-options" role="menu" aria-label="Choose export format"><button role="menuitem" onClick={()=>{exportFinalPdf();setOpenMenu('')}}><span className="export-format-icon">PDF</span><span><strong>PDF</strong><small>Portable document</small></span><Download size={14}/></button><button role="menuitem" onClick={()=>{exportFinalWord();setOpenMenu('')}}><span className="export-format-icon">DOC</span><span><strong>Word</strong><small>Editable document</small></span><Download size={14}/></button><button role="menuitem" onClick={()=>{exportFinalText();setOpenMenu('')}}><span className="export-format-icon">TXT</span><span><strong>Text</strong><small>Plain text file</small></span><Download size={14}/></button></div>}</div></div>}</div><textarea className="final-output-editor" aria-label={pendingFindings.length?'Live output preview':'Editable final output preview'} value={draft} readOnly={pendingFindings.length>0} onChange={e=>{setDraft(e.target.value);setFinalOutputEdited(true)}} spellCheck="true"/><div className="final-output-footer"><span>{words} words <span>·</span> {draft.length} characters</span><span className={finalOutputEdited?'final-output-warning':'final-output-saved'}>{finalOutputEdited?'Edited after review · recheck to refresh the score':pendingFindings.length?`${pendingFindings.length} ${pendingFindings.length===1?'decision remains':'decisions remain'}`:'Editable preview · matches your reviewed draft'}</span></div></section>}
      </main>
      <footer className="page-footer"><span>BRANDGUARD AI <span>·</span> AI PRECISION, HUMAN JUDGMENT</span><span>Smart guardrails for your brand’s voice <span className="footer-star">✳</span></span></footer>
    </div>
    {showHelp&&<div className="help-backdrop" onClick={()=>setShowHelp(false)}><section className="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={e=>e.stopPropagation()}><div className="help-dialog-head"><span className="help-icon"><ShieldCheck size={18}/></span><button className="modal-close" aria-label="Close help" onClick={()=>setShowHelp(false)}><X size={17}/></button></div><p className="eyebrow help-eyebrow">A QUICK WALKTHROUGH</p><h2 id="help-title">Your brand guide.<br/><em>Your final call.</em></h2><div className="help-step"><span>01</span><div><strong>Start with approved rules</strong><p>Your manager’s brand guidelines are already loaded in this workspace.</p></div></div><div className="help-step"><span>02</span><div><strong>Add your content</strong><p>Paste a draft or upload a .txt or .md script, then analyze it.</p></div></div><div className="help-step"><span>03</span><div><strong>Review and export</strong><p>Accept or reject every suggestion. Then edit the final copy and download it as TXT or Word.</p></div></div><div className="help-dialog-foot"><ShieldCheck size={15}/> You make the final call on every change.</div></section></div>}
  </div>
}

export default App
