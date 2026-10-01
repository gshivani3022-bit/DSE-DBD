// FILEGUARD FRONTEND
// This React page uses the API Gateway on port 8080; it never connects to MySQL.
// Choosing or updating a file uploads its bytes to the backend, then reloads version history and Recent Activity.
const { useState, useMemo, useCallback, useEffect, useRef } = React;

/* ================= Date and file display helpers ================= */
function pad(n){ return String(n).padStart(2,'0'); }
function fmtTime(d){
  let h = d.getHours(), ampm = h>=12 ? 'PM':'AM';
  h = h % 12; if(h===0) h = 12;
  return `${pad(h)}:${pad(d.getMinutes())} ${ampm}`;
}
function fmtDay(d, refNow){
  const oneDay = 86400000;
  const dOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const nOnly = new Date(refNow.getFullYear(), refNow.getMonth(), refNow.getDate());
  const diff = Math.round((nOnly - dOnly) / oneDay);
  if(diff === 0) return 'Today';
  if(diff === 1) return 'Yesterday';
  return `${d.toLocaleString('en-US',{month:'short'})} ${d.getDate()}`;
}
function fmtFull(d){
  return `${d.toLocaleString('en-US',{month:'long'})} ${d.getDate()}, ${d.getFullYear()} — ${fmtTime(d)}`;
}
function fmtShort(d, refNow){ return `${fmtDay(d, refNow)}, ${fmtTime(d)}`; }

const NOW = new Date();

const FILE_TYPES = {
  docx: { label:'Document', icon:'📄', diffable:true },
  txt:  { label:'Text', icon:'📝', diffable:true },
  md:   { label:'Text', icon:'📝', diffable:true },
  pdf:  { label:'PDF', icon:'📕', diffable:false },
  pptx: { label:'Presentation', icon:'📊', diffable:false },
  xlsx: { label:'Spreadsheet', icon:'📈', diffable:false },
};
function extOf(name){ const p = name.split('.'); return p.length>1 ? p[p.length-1].toLowerCase() : 'txt'; }
function typeOf(name){ return FILE_TYPES[extOf(name)] || FILE_TYPES.txt; }

let idCounter = 1;
function nextId(prefix){ return `${prefix}_${idCounter++}`; }

/* ================= Diff helper (line-based LCS) ================= */
function diffLines(a, b){
  const la = (a||'').split('\n'), lb = (b||'').split('\n');
  const n = la.length, m = lb.length;
  const dp = Array.from({length:n+1}, ()=> new Array(m+1).fill(0));
  for(let i=n-1;i>=0;i--) for(let j=m-1;j>=0;j--)
    dp[i][j] = la[i]===lb[j] ? dp[i+1][j+1]+1 : Math.max(dp[i+1][j], dp[i][j+1]);
  const left=[], right=[]; let i=0,j=0;
  while(i<n && j<m){
    if(la[i]===lb[j]){ left.push({t:'same',x:la[i]}); right.push({t:'same',x:lb[j]}); i++; j++; }
    else if(dp[i+1][j] >= dp[i][j+1]){ left.push({t:'removed',x:la[i]}); i++; }
    else { right.push({t:'added',x:lb[j]}); j++; }
  }
  while(i<n){ left.push({t:'removed',x:la[i]}); i++; }
  while(j<m){ right.push({t:'added',x:lb[j]}); j++; }
  return { left, right };
}

/* ================= Small presentational components ================= */
function Icon({children}){ return <span className="icon">{children}</span>; }

function MonitorPill(){
  return <div className="monitor-pill"><span className="dot off"></span>Manual uploads</div>;
}
function StatPill({label, value, foot, success}){
  return (
    <div className="card stat-card">
      <div className="label">{label}</div>
      <div className={`value ${success?'success':''}`}>{value}</div>
      {foot && <div className="foot">{foot}</div>}
    </div>
  );
}

function Toasts({toasts}){
  return (
    <div className="toast-stack">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <span>{t.kind==='success' ? '✓' : 'ⓘ'}</span>
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

/* ================= App ================= */
const API='http://localhost:8080/api';
const toFile=f=>({...f,id:String(f.id),name:f.fileName||f.name,path:f.filePath||f.path,folder:f.folderPath||f.folder,versions:(f.versions||[]).map(v=>({v:v.versionNumber||v.v,timestamp:new Date(v.createdAt||v.timestamp),size:`${((v.fileSize||0)/1048576).toFixed(2)} MB`,content:v.content??null,restoredFrom:v.restoredFrom||null,storagePath:v.storagePath}))});
// Sends JSON requests to the Gateway and shows backend error messages to the user.
async function request(path,options={}){const r=await fetch(API+path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}}); if(!r.ok){let m=`Request failed (${r.status})`;try{m=(await r.json()).message||m}catch{} throw new Error(m)} return r.status===204?null:r.json()}
// Sends a browser-selected file as multipart/form-data; the browser supplies its boundary header.
async function uploadRequest(path,form){const r=await fetch(API+path,{method:'POST',body:form});if(!r.ok){let m='Upload failed ('+r.status+')';try{m=(await r.json()).message||m}catch{}throw new Error(m)}return r.json()}
function App(){
  const [files,setFiles]=useState([]),[folders,setFolders]=useState([]),[activity,setActivity]=useState([]),[maxVersions,setMaxVersions]=useState(10),[autoRemove,setAutoRemove]=useState(true),[storageLocation,setStorageLocation]=useState(''),[loading,setLoading]=useState(true),[storageStats,setStorageStats]=useState({fileCount:0,totalBytes:0});
  const [page,setPage]=useState('home'),[selectedFileId,setSelectedFileId]=useState(null),[selectedVersionNum,setSelectedVersionNum]=useState(null),[compareVersions,setCompareVersions]=useState([]),[openSession,setOpenSession]=useState({}),[modal,setModal]=useState(null),[toasts,setToasts]=useState([]);
  const [deletedFiles,setDeletedFiles]=useState([]);
  const browseInput=useRef(null),updateInput=useRef(null),updateTarget=useRef(null);
  function pushToast(text,kind='info'){const id=nextId('toast');setToasts(t=>[...t,{id,text,kind}]);setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),4000)}
  // Reload files, each file's real version history, persisted activity, settings, and storage totals.
  async function refresh(){const [fs,fo,act,settings,stats]=await Promise.all([request('/files'),request('/files/folders'),request('/activity'),request('/settings'),request('/storage/stats')]);const expanded=await Promise.all(fs.map(async f=>({...f,versions:await request('/files/'+f.id+'/versions')})));setFiles(expanded.map(toFile));setFolders(fo);setActivity(act.map(x=>({id:x.id,kind:'success',text:<>{x.action.replaceAll('_',' ')} — <b>{x.details||('File '+x.fileId)}</b></>,time:new Date(x.timestamp)})));setMaxVersions(settings.maxVersions);setAutoRemove(settings.autoRemove);setStorageLocation(settings.storageLocation);setStorageStats(stats)}
  useEffect(()=>{refresh().catch(e=>pushToast(e.message,'info')).finally(()=>setLoading(false))},[]);
  async function act(fn,success){try{await fn();await refresh();if(success)pushToast(success,'success')}catch(e){pushToast(e.message,'info')}}
  function goHome(){setPage('home');setSelectedFileId(null);setSelectedVersionNum(null);setCompareVersions([])}
  // Open File sends the selected item to File Service. A changed same-name file becomes a new version;
  // after upload, select its record so the newest version and Recent Activity appear immediately.
  async function handleBrowseUpload(file){if(!file)return;try{const form=new FormData();form.append('file',file);form.append('folderPath','Documents');const tracked=await uploadRequest('/files/upload',form);await refresh();setModal(null);openFileDetails(String(tracked.id));pushToast(file.name+' tracked','success')}catch(e){pushToast(e.message)}finally{if(browseInput.current)browseInput.current.value=''}}
  async function handleCreateFile({name,folder,content}){const file=new File([content||''],name,{type:'text/plain'});if(!name)return;try{const form=new FormData();form.append('file',file);form.append('folderPath',folder||'Documents');const tracked=await uploadRequest('/files/upload',form);await refresh();setModal(null);openFileDetails(String(tracked.id));pushToast(name+' tracked','success')}catch(e){pushToast(e.message)}}
  // Uploads the updated copy for one known record, then reloads that file's history and activity list.
  async function handleUploadUpdatedFile(fileId,file){if(!file)return;try{const form=new FormData();form.append('file',file);form.append('originalFileName',file.name);await uploadRequest('/files/'+fileId+'/versions/upload',form);await refresh();pushToast('New version uploaded for '+file.name,'success')}catch(e){pushToast(e.message)}finally{if(updateInput.current)updateInput.current.value=''}}
  async function loadDeletedFiles(){try{setDeletedFiles(await request('/files?status=DELETED'))}catch(e){pushToast(e.message)}}
  async function recoverFile(id){await act(()=>request('/files/'+id+'/recover',{method:'POST'}),'File recovered');await loadDeletedFiles()}
  async function deleteFile(file){await act(()=>request('/files/'+file.id,{method:'DELETE'}),file.name+' moved to Recently Deleted');goHome()}
  async function openFileDetails(id){setSelectedFileId(String(id));setSelectedVersionNum(null);setCompareVersions([]);setPage('fileDetails');try{const f=toFile({...await request(`/files/${id}`),versions:await request(`/files/${id}/versions`)});setFiles(p=>p.map(x=>x.id===String(id)?f:x))}catch(e){pushToast(e.message)}}
  const activeFile=useMemo(()=>files.find(f=>f.id===selectedFileId)||null,[files,selectedFileId]);
  async function downloadVersion(f,v){try{const r=await fetch(API+'/storage/files/'+f.id+'/versions/'+v);if(!r.ok)throw new Error('Download failed');const blob=await r.blob();const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=f.name+'.v'+v;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000)}catch(e){pushToast(e.message)}}
  async function openCurrentFile(f){const v=f.versions.at(-1)?.v;if(v)await downloadVersion(f,v);setOpenSession(x=>({...x,[f.id]:true}));pushToast(`Downloaded current version of ${f.name}`,'success')}
  async function handleCreateVersionManually(f){await act(()=>request(`/files/${f.id}/versions`,{method:'POST',body:JSON.stringify({reason:'MANUAL'})}),`Version created for ${f.name}`)}
  async function handleRestore(f,v){await act(()=>request(`/files/${f.id}/versions/${v}/restore`,{method:'POST'}),`Restored V${v} of ${f.name}`);setModal(null)}
  async function handleAddFolder(name){await act(()=>request('/files/folders',{method:'POST',body:JSON.stringify({name:name.trim()})}),`${name} added`);setModal(null)}
  async function handleRemoveFolder(id){await act(()=>request(`/files/folders/${id}`,{method:'DELETE'}),'Folder removed')}
  async function saveSettings(patch){await act(()=>request('/settings',{method:'PUT',body:JSON.stringify({maxVersions,autoRemove,...patch})}),'Settings saved')}
  const sortedFiles=useMemo(()=>[...files].sort((a,b)=>new Date(b.versions.at(-1)?.timestamp||0)-new Date(a.versions.at(-1)?.timestamp||0)),[files]);
  const totalVersions=useMemo(()=>files.reduce((s,f)=>s+f.versions.length,0),[files]);
  return (
    <div className="shell">
      <Sidebar page={page} setPage={setPage} onHome={goHome} />
      <div className="content">
        {loading && <div className="card card-pad">Loading files from the API Gateway…</div>}
        {/* The dashboard Open File button clicks the hidden input, which launches the computer's native picker. */}
        {page==='home' &&
          <Dashboard
            files={sortedFiles} folders={folders} activity={activity}
            totalVersions={totalVersions}
            onOpenFile={()=>browseInput.current?.click()}
            onCreateFile={()=>setModal('createFile')}
            onSelectFile={openFileDetails}
            onSeeAllActivity={()=>setPage('activity')}
          />
        }
        {page==='files' &&
          <MyFiles files={sortedFiles} deletedFiles={deletedFiles} onLoadDeleted={loadDeletedFiles} onRecover={recoverFile}
            onSelectFile={openFileDetails} onCreateFile={()=>setModal('createFile')} />
        }
        {page==='activity' &&
          <RecentActivityPage activity={activity} onBack={goHome} />
        }
        {page==='folders' &&
          <ManagedFoldersPage folders={folders} files={files} onAdd={()=>setModal('addFolder')} onRemove={handleRemoveFolder} onBack={goHome} />
        }
        {page==='settings' &&
          <SettingsPage
            folders={folders} onAddFolder={()=>setModal('addFolder')} onRemoveFolder={handleRemoveFolder}
            maxVersions={maxVersions} setMaxVersions={v=>{setMaxVersions(v);saveSettings({maxVersions:v})}}
            autoRemove={autoRemove} setAutoRemove={v=>{setAutoRemove(v);saveSettings({autoRemove:v})}}
            storageLocation={storageLocation} storageStats={storageStats}
            onBack={goHome}
          />
        }
        {page==='fileDetails' && activeFile &&
          <FileDetails
            file={activeFile}
            opened={!!openSession[activeFile.id]}
            onBack={goHome}
            onOpenExternal={()=>openCurrentFile(activeFile)}
            onSimulateSave={()=>{updateTarget.current=activeFile;updateInput.current?.click()}}
            onDelete={()=>deleteFile(activeFile)}
            onCreateVersion={()=>handleCreateVersionManually(activeFile)}
            onViewVersion={(v)=>{ setSelectedVersionNum(v); setPage('versionDetails'); }}
            onCompareRequest={(a,b)=>{ setCompareVersions([a,b]); setPage('compare'); }}
            onRestoreRequest={(v)=> setModal({type:'restore', fileId:activeFile.id, v}) }
          />
        }
        {page==='versionDetails' && activeFile && selectedVersionNum!==null &&
          <VersionDetails
            file={activeFile} versionNum={selectedVersionNum}
            onBack={()=>setPage('fileDetails')} onOpenVersion={()=>downloadVersion(activeFile,selectedVersionNum)}
            onCompareWithCurrent={()=>{ const last = activeFile.versions[activeFile.versions.length-1].v; setCompareVersions([selectedVersionNum, last]); setPage('compare'); }}
            onRestoreRequest={()=> setModal({type:'restore', fileId:activeFile.id, v:selectedVersionNum}) }
          />
        }
        {page==='compare' && activeFile && compareVersions.length===2 &&
          <CompareVersions
            file={activeFile} vA={compareVersions[0]} vB={compareVersions[1]} onDownloadBoth={()=>{downloadVersion(activeFile,compareVersions[0]);downloadVersion(activeFile,compareVersions[1])}}
            onBack={()=>setPage('fileDetails')}
          />
        }
      </div>

      {modal==='createFile' &&
        <CreateFileModal folders={folders} onClose={()=>setModal(null)} onCreate={handleCreateFile} />
      }
      {modal==='addFolder' &&
        <AddFolderModal onClose={()=>setModal(null)} onAdd={handleAddFolder} />
      }
      {modal && modal.type==='restore' &&
        <RestoreConfirmModal
          version={modal.v}
          onClose={()=>setModal(null)}
          onConfirm={()=>{ const f = files.find(x=>x.id===modal.fileId); handleRestore(f, modal.v); }}
        />
      }
      {/* Native file chooser. The selected file is uploaded to the backend by handleBrowseUpload. */}
      <input ref={browseInput} type="file" hidden onChange={e=>handleBrowseUpload(e.target.files?.[0])} />
      {/* Opens the native chooser again after downloading/editing a tracked file. */}
      <input ref={updateInput} type="file" hidden onChange={e=>handleUploadUpdatedFile(updateTarget.current?.id,e.target.files?.[0])} />

      <Toasts toasts={toasts} />
    </div>
  );
}

/* ================= Sidebar ================= */
function Sidebar({page, setPage, onHome}){
  const items = [
    { key:'home', icon:'🏠', label:'Home' },
    { key:'files', icon:'📄', label:'My Files' },
    { key:'activity', icon:'🕘', label:'Recent Activity' },
    { key:'folders', icon:'📁', label:'Managed Folders' },
  ];
  const isActive = (k) => page===k || (k==='files' && (page==='fileDetails'||page==='versionDetails'||page==='compare'));
  return (
    <div className="sidebar">
      <div className="sidebar-brand" onClick={onHome} style={{cursor:'pointer'}}>
        <div className="logo">FG</div>
        <div>
          <div className="name">FileGuard</div>
          <div className="sub">Version &amp; Recovery</div>
        </div>
      </div>
      <div className="nav-group">
        {items.map(it => (
          <button key={it.key} className={`nav-item ${isActive(it.key)?'active':''}`} onClick={()=>setPage(it.key)}>
            <Icon>{it.icon}</Icon>{it.label}
          </button>
        ))}
      </div>
      <button className={`nav-item ${page==='settings'?'active':''}`} onClick={()=>setPage('settings')}>
        <Icon>⚙</Icon>Settings
      </button>
      <div className="sidebar-footer">
        <MonitorPill />
      </div>
    </div>
  );
}

/* ================= Dashboard ================= */
function Dashboard({files, folders, activity, totalVersions, onOpenFile, onCreateFile, onSelectFile, onSeeAllActivity}){
  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Manage your files. Keep every important version.</h1>
          <div className="desc">FileGuard watches your managed folders and quietly protects your work as you go.</div>
        </div>
      </div>

      <div className="hero-actions">
        <button className="btn primary" onClick={onOpenFile}><Icon>📂</Icon>Open File</button>
        <button className="btn" onClick={onCreateFile}><Icon>＋</Icon>Create File</button>
      </div>

      <div className="list-block">
        <div className="list-block-head"><h3>Recent Files</h3></div>
        <div className="card">
          {files.slice(0,4).map(f => <FileRow key={f.id} file={f} onClick={()=>onSelectFile(f.id)} />)}
        </div>
      </div>

      <div className="list-block">
        <div className="list-block-head"><h3>Managed Folders</h3></div>
        <div className="folder-chip-row">
          {folders.map(fo => (
            <div key={fo.id} className="folder-chip"><span>📁 {fo.name}</span></div>
          ))}
        </div>
      </div>

      <div className="list-block">
        <div className="list-block-head">
          <h3>Recent Activity</h3>
          <button className="link-more" onClick={onSeeAllActivity}>View all</button>
        </div>
        <div className="card">
          {activity.slice(0,4).map(a => <ActivityRow key={a.id} item={a} />)}
        </div>
      </div>
    </div>
  );
}

function FileRow({file, onClick}){
  const last = file.versions[file.versions.length-1] || {v:file.currentVersion||0,timestamp:file.updatedAt||file.createdAt,size:'0 B'};
  const t = typeOf(file.name);
  return (
    <div className="file-row" onClick={onClick}>
      <div className="fico">{t.icon}</div>
      <div className="finfo">
        <div className="fname">{file.name}</div>
        <div className="fpath mono">{file.path}</div>
      </div>
      <div className="fmeta">
        <div className="fver">Version {last.v}</div>
        <div className="ftime">{fmtShort(last.timestamp, NOW)}</div>
      </div>
    </div>
  );
}

function ActivityRow({item}){
  return (
    <div className="activity-item">
      <div className={`aic ${item.kind}`}>{item.kind==='success' ? '✓' : 'ℹ'}</div>
      <div>
        <div className="atext">{item.text}</div>
        <div className="atime">{fmtShort(item.time, NOW)}</div>
      </div>
    </div>
  );
}

/* ================= My Files ================= */
function MyFiles({files, deletedFiles, onLoadDeleted, onRecover, onSelectFile, onCreateFile}){
  const [showDeleted,setShowDeleted]=useState(false);
  return (
    <div>
      <div className="page-header">
        <div>
          <h1>My Files</h1>
          <div className="desc">Every file currently tracked by FileGuard.</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn" onClick={()=>{const next=!showDeleted;setShowDeleted(next);if(next)onLoadDeleted()}}>{showDeleted?'Hide':'Show'} Recently Deleted</button>
          <button className="btn primary" onClick={onCreateFile}><Icon>＋</Icon>Create File</button>
        </div>
      </div>
      {files.length===0
        ? <div className="card empty-state"><div className="glyph">📄</div><div className="msg">No files tracked yet.</div></div>
        : <div className="card">{files.map(f => <FileRow key={f.id} file={f} onClick={()=>onSelectFile(f.id)} />)}</div>
      }
      {showDeleted && <div style={{marginTop:20}}>
        <div className="section-title">Recently Deleted</div>
        {deletedFiles.length===0
          ? <div className="card empty-state"><div className="msg">No deleted files.</div></div>
          : <div className="card">{deletedFiles.map(f=><div className="file-row" key={f.id}>
              <div className="fico">{typeOf(f.fileName).icon}</div><div className="finfo">
                <div className="fname">{f.fileName}</div><div className="fpath mono">{f.filePath}</div>
              </div><button className="btn small primary" onClick={()=>onRecover(f.id)}>Recover</button>
            </div>)}</div>
        }
      </div>}
    </div>
  );
}

/* ================= Recent Activity page ================= */
function RecentActivityPage({activity, onBack}){
  return (
    <div>
      <button className="back-link" onClick={onBack}>← Home</button>
      <div className="page-header">
        <div><h1>Recent Activity</h1><div className="desc">Everything FileGuard has done in the background.</div></div>
      </div>
      {activity.length===0
        ? <div className="card empty-state"><div className="glyph">🕘</div><div className="msg">No activity yet.</div></div>
        : <div className="card">{activity.map(a => <ActivityRow key={a.id} item={a} />)}</div>
      }
    </div>
  );
}

/* ================= Managed Folders page ================= */
function ManagedFoldersPage({folders, files, onAdd, onRemove, onBack}){
  const countFor = (folderName) => files.filter(f=>f.folder===folderName).length;
  return (
    <div>
      <button className="back-link" onClick={onBack}>← Home</button>
      <div className="page-header">
        <div><h1>Managed Folders</h1><div className="desc">FileGuard only watches the folders you choose.</div></div>
        <button className="btn primary" onClick={onAdd}><Icon>＋</Icon>Add Folder</button>
      </div>
      {folders.length===0
        ? <div className="card empty-state"><div className="glyph">📁</div><div className="msg">No folders are being monitored.</div></div>
        : <div className="card">
            {folders.map(fo => (
              <div key={fo.id} className="file-row" style={{cursor:'default'}}>
                <div className="fico">📁</div>
                <div className="finfo">
                  <div className="fname">{fo.name}</div>
                  <div className="fpath mono">{fo.path}</div>
                </div>
                <div className="fmeta" style={{display:'flex', alignItems:'center', gap:14}}>
                  <span className="ftime">{countFor(fo.name)} file{countFor(fo.name)===1?'':'s'}</span>
                  <button className="btn small danger" onClick={()=>onRemove(fo.id)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
      }
    </div>
  );
}

/* ================= Settings ================= */
function SettingsPage({folders, onAddFolder, onRemoveFolder, maxVersions, setMaxVersions, autoRemove, setAutoRemove, storageLocation, storageStats, onBack}){
  return (
    <div>
      <button className="back-link" onClick={onBack}>← Home</button>
      <div className="page-header"><div><h1>Settings</h1><div className="desc">Manage version retention and inspect managed storage.</div></div></div>

      <div className="settings-section">
        <div className="section-title">General</div>
        <div className="card">
          <div className="settings-row">
            <div><div className="lab">Application Name</div><div className="hint">Shown in the sidebar and window title</div></div>
            <div className="path-tag">FileGuard</div>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="section-title">Versioning Workflow</div>
        <div className="card card-pad">
          <div className="lab">Manual upload-based tracking</div>
          <div className="hint">Browse a file or upload its saved copy to create a version. FileGuard does not watch desktop editor saves.</div>
        </div>
      </div>
      <div className="settings-section">
        <div className="section-title">Version Retention</div>
        <div className="card">
          <div className="settings-row">
            <div><div className="lab">Maximum versions per file</div><div className="hint">Applies to every tracked file</div></div>
            <input className="num-input" type="number" min="1" max="100" value={maxVersions}
              onChange={e=>setMaxVersions(Math.max(1, parseInt(e.target.value,10)||1))} />
          </div>
          <div className="settings-row">
            <div className="checkbox-row">
              <input type="checkbox" checked={autoRemove} onChange={e=>setAutoRemove(e.target.checked)} id="autoRemoveChk" />
              <label htmlFor="autoRemoveChk" style={{fontSize:13.5, fontWeight:600}}>Automatically remove oldest version when the limit is exceeded</label>
            </div>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="section-title">Storage</div>
        <div className="card">
          <div className="settings-row">
            <div style={{flex:1}}>
              <div className="lab">Project-managed version storage</div>
              <div className="path-tag mono" style={{marginTop:8, display:'inline-block'}}>{storageLocation}</div>
            </div>
          </div>
          <div className="settings-row">
            <div className="lab">Current storage used</div>
            <div style={{fontWeight:700}}>{(storageStats.totalBytes/1048576).toFixed(2)} MB across {storageStats.fileCount} files</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= File Details ================= */
function FileDetails({file, opened, onBack, onOpenExternal, onSimulateSave, onDelete, onCreateVersion, onViewVersion, onCompareRequest, onRestoreRequest}){
  const [checked, setChecked] = useState([]);
  const t = typeOf(file.name);
  const last = file.versions[file.versions.length-1] || {v:file.currentVersion||0,timestamp:file.updatedAt||file.createdAt,size:'0 B'};
  const reversed = [...file.versions].reverse();

  function toggleCheck(v){
    setChecked(c => {
      if(c.includes(v)) return c.filter(x=>x!==v);
      const nc = [...c, v];
      return nc.length>2 ? nc.slice(1) : nc;
    });
  }

  return (
    <div>
      <button className="back-link" onClick={onBack}>← Home</button>

      <div className="file-title-row">
        <div className="fico-lg">{t.icon}</div>
        <h2>{file.name}</h2>
      </div>
      <div className="file-path mono">{file.path}</div>

      <div className="fd-stats">
        <div className="fd-stat"><div className="l">Current Version</div><div className="v">V{last.v}</div></div>
        <div className="fd-stat"><div className="l">Last Modified</div><div className="v">{fmtShort(last.timestamp, NOW)}</div></div>
        <div className="fd-stat"><div className="l">File Size</div><div className="v">{last.size}</div></div>
      </div>

      <div className="fd-actions">
        <button className="btn primary" onClick={onOpenExternal}><Icon>📂</Icon>Download Current File</button>
        <button className="btn" onClick={onCreateVersion}><Icon>＋</Icon>Create Version</button>
        <button className="btn" disabled={checked.length!==2} onClick={()=>onCompareRequest(...([...checked].sort((a,b)=>a-b)))}>
          Compare Selected
        </button>
        <button className="btn danger" onClick={onDelete}>Delete File</button>
      </div>

      {opened &&
        <div className="external-session">
          <div className="txt"><b>{file.name}</b> was downloaded. Select its updated copy to save a new version.</div>
          <button className="btn small primary" onClick={onSimulateSave}>Upload Saved Changes</button>
        </div>
      }

      <div className="section-title">Version History</div>
      <div className="card">
        <ul className="version-list">
          {reversed.map((ver, idx) => {
            const isCurrent = idx===0;
            return (
              <li key={ver.v} className={`version-row ${isCurrent?'current':''}`}>
                <input type="checkbox" checked={checked.includes(ver.v)} onChange={()=>toggleCheck(ver.v)} style={{marginRight:2}} />
                <div className="vbadge">V{ver.v}</div>
                <div className="vinfo">
                  <div className="vtop">
                    <span className="vtime">{fmtShort(ver.timestamp, NOW)}</span>
                    <span className="vsize mono">{ver.size}</span>
                    {isCurrent && <span className="vtag">Current</span>}
                  </div>
                  {ver.restoredFrom && <div className="vnote">{ver.restoredFrom}</div>}
                </div>
                <div className="vactions">
                  <button className="btn small" onClick={()=>onViewVersion(ver.v)}>View</button>
                  {!isCurrent && <>
                    <button className="btn small" onClick={()=>onCompareRequest(ver.v, last.v)}>Compare</button>
                    <button className="btn small danger" onClick={()=>onRestoreRequest(ver.v)}>Restore</button>
                  </>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/* ================= Version Details ================= */
function VersionDetails({file, versionNum, onBack, onOpenVersion, onCompareWithCurrent, onRestoreRequest}){
  const ver = file.versions.find(v=>v.v===versionNum);
  const last = file.versions[file.versions.length-1];
  const isCurrent = ver.v === last.v;
  const t = typeOf(file.name);
  return (
    <div>
      <button className="back-link" onClick={onBack}>← Version History</button>
      <div className="page-header"><div><h1>Version {ver.v}</h1><div className="desc">{file.name}</div></div></div>

      <div className="card card-pad" style={{maxWidth:520}}>
        <div style={{display:'flex', flexDirection:'column', gap:14}}>
          <Row label="Created" value={fmtFull(ver.timestamp)} />
          <Row label="File Size" value={ver.size} />
          <Row label="Location" value={<span className="mono" style={{fontSize:12}}>{file.path}</span>} />
          <Row label="Version" value={`${ver.v} of ${last.v}`} />
          {ver.restoredFrom && <Row label="Note" value={ver.restoredFrom} />}
        </div>
      </div>

      <div className="fd-actions" style={{marginLeft:0, marginTop:22}}>
        <button className="btn" onClick={onOpenVersion}>Download This Version</button>
        {!isCurrent && <button className="btn" onClick={onCompareWithCurrent}>Compare With Current</button>}
        {!isCurrent && <button className="btn danger" onClick={()=>onRestoreRequest(ver.v)}>Restore This Version</button>}
      </div>

      {isCurrent && <div style={{marginTop:14, color:'var(--ink-faint)', fontSize:12.5}}>This is the current version of the file.</div>}
    </div>
  );
}
function Row({label, value}){
  return (
    <div style={{display:'flex', justifyContent:'space-between', gap:16}}>
      <span style={{color:'var(--ink-soft)', fontSize:12.5, fontWeight:600}}>{label}</span>
      <span style={{fontWeight:600, fontSize:13, textAlign:'right'}}>{value}</span>
    </div>
  );
}

/* ================= Compare Versions ================= */
function CompareVersions({file, vA, vB, onBack, onDownloadBoth}){
  const [comparison,setComparison]=useState(null),[compareError,setCompareError]=useState('');
  useEffect(()=>{request(`/files/${file.id}/compare?v1=${vA}&v2=${vB}`).then(setComparison).catch(e=>setCompareError(e.message))},[file.id,vA,vB]);
  const a = {...file.versions.find(v=>v.v===vA),content:comparison?.content1};
  const b = {...file.versions.find(v=>v.v===vB),content:comparison?.content2};
  const t = typeOf(file.name);

  return (
    <div>
      <button className="back-link" onClick={onBack}>← File Details</button>
      <div className="page-header"><div><h1>Compare Versions</h1><div className="desc">{file.name}</div></div></div>

      <div className="compare-head">
        <div className="compare-side"><div className="cv">Version {a.v}</div><div className="ct">{fmtShort(a.timestamp, NOW)}</div></div>
        <div className="compare-vs">VS</div>
        <div className="compare-side"><div className="cv">Version {b.v}</div><div className="ct">{fmtShort(b.timestamp, NOW)}</div></div>
      </div>

      {compareError ? <div className="card card-pad">{compareError}</div> : !comparison ? <div className="card card-pad">Loading comparison…</div> : (comparison.binary || !t.diffable) ? <MetaDiff file={file} a={a} b={b} /> : <TextDiff a={a} b={b} />}
    </div>
  );
}

function TextDiff({a, b}){
  const { left, right } = diffLines(a.content, b.content);
  const renderSide = (arr) => arr.map((l,i) => {
    const prefix = l.t==='added' ? '+ ' : l.t==='removed' ? '- ' : '  ';
    return <div key={i} className={`dl ${l.t}`}>{prefix}{l.x || ' '}</div>;
  });
  return (
    <div className="diff-grid">
      <div className="diff-pane">{renderSide(left)}</div>
      <div className="diff-pane">{renderSide(right)}</div>
    </div>
  );
}

function MetaDiff({file, a, b}){
  return (
    <>
      <div className="meta-compare-grid">
        <div className="card card-pad">
          <div className="section-title">Version {a.v}</div>
          <div className="row"><span>File Size</span><span>{a.size}</span></div>
          <div className="row"><span>Modified</span><span>{fmtShort(a.timestamp, NOW)}</span></div>
          <div className="row"><span>Version</span><span>V{a.v}</span></div>
        </div>
        <div className="card card-pad">
          <div className="section-title">Version {b.v}</div>
          <div className="row"><span>File Size</span><span>{b.size}</span></div>
          <div className="row"><span>Modified</span><span>{fmtShort(b.timestamp, NOW)}</span></div>
          <div className="row"><span>Version</span><span>V{b.v}</span></div>
        </div>
      </div>
      <div className="hint" style={{color:'var(--ink-faint)', fontSize:12.5, marginBottom:16}}>
        Line-by-line comparison isn't available for this file type — showing version metadata instead.
      </div>
      <button className="btn" onClick={onDownloadBoth}>Download Both Versions</button>
    </>
  );
}

/* ================= Modals ================= */
function ModalShell({children, wide, onClose}){
  return (
    <div className="modal-backdrop" onClick={(e)=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div className={`modal ${wide?'wide':''}`}>{children}</div>
    </div>
  );
}

function CreateFileModal({folders, onClose, onCreate}){
  const [name, setName] = useState('');
  const [folder, setFolder] = useState(folders[0] ? folders[0].name : '');
  const [type, setType] = useState('docx');
  const [content, setContent] = useState('');

  function submit(){
    if(!name.trim()) return;
    let fname = name.trim();
    if(!fname.includes('.')) fname = `${fname}.${type}`;
    onCreate({ name: fname, folder: folder || 'Documents', type, content });
  }

  return (
    <ModalShell onClose={onClose}>
      <h3>Create New File</h3>
      <div className="modal-sub">FileGuard will start tracking versions from V1.</div>
      <div className="field">
        <label>File Name</label>
        <input placeholder="Project_Report.docx" value={name} onChange={e=>setName(e.target.value)} />
      </div>
      <div className="field">
        <label>Initial text content (optional)</label>
        <textarea rows="4" placeholder="Write initial file content for text-based versions" value={content} onChange={e=>setContent(e.target.value)} />
      </div>
      <div className="field">
        <label>Location</label>
        <select value={folder} onChange={e=>setFolder(e.target.value)}>
          {folders.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label>File Type</label>
        <select value={type} onChange={e=>setType(e.target.value)}>
          <option value="docx">Document (.docx)</option>
          <option value="txt">Text (.txt)</option>
          <option value="xlsx">Spreadsheet (.xlsx)</option>
          <option value="pptx">Presentation (.pptx)</option>
          <option value="pdf">PDF (.pdf)</option>
        </select>
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!name.trim()} onClick={submit}>Create File</button>
      </div>
    </ModalShell>
  );
}

function AddFolderModal({onClose, onAdd}){
  const [name, setName] = useState('');
  return (
    <ModalShell onClose={onClose}>
      <h3>Add Managed Folder</h3>
      <div className="modal-sub">FileGuard will watch this folder and version any changes inside it.</div>
      <div className="field">
        <label>Folder Name</label>
        <input placeholder="e.g. Internships" value={name} onChange={e=>setName(e.target.value)} />
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!name.trim()} onClick={()=>onAdd(name)}>Add Folder</button>
      </div>
    </ModalShell>
  );
}

function RestoreConfirmModal({version, onClose, onConfirm}){
  return (
    <ModalShell onClose={onClose}>
      <h3>Restore Version {version}?</h3>
      <div className="warn-box">
        Your current file will be restored using Version {version}. Your current version will <b>not</b> be permanently deleted — a new version will be added to the history.
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn danger" onClick={onConfirm}>Restore Version</button>
      </div>
    </ModalShell>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
