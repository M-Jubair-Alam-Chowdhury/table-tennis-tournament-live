/* ============================================================
   Table Tennis tournament logic — server-side authoritative copy.
   Ported from the original single-page app. Same algorithms and
   state machine; DOM reads/alerts replaced with plain arguments
   and thrown errors so a WebSocket server can drive it.
   ============================================================ */

function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}
function isPowerOfTwo(n){ return n>0 && (n & (n-1))===0; }
function v2(n){ let k=0; while(n%2===0){ n/=2; k++; } return k; }

function assignCodes(names){
  const codeMap={}, codeToName={};
  names.forEach((name,i)=>{ const c="P"+(i+1); codeMap[name]=c; codeToName[c]=name; });
  return {codeMap, codeToName};
}

function countMatches(n){
  if(n%2!==0) return {type:"round-robin", matches:n*(n-1)/2};
  if(isPowerOfTwo(n)) return {type:"elimination", matches:n-1};
  const k=v2(n), m=n/Math.pow(2,k);
  const elim=n-m, rr=m*(m-1)/2, final=1;
  return {type:"hybrid", matches:elim+rr+final, elim, rr, final, m, k};
}

function generateRoundRobin(list){
  let arr=list.slice();
  let n=arr.length;
  if(n%2!==0){ arr.push("BYE"); n++; }
  const numRounds=n-1, half=n/2;
  const fixed=arr[0];
  let rotating=arr.slice(1);
  const rounds=[];
  for(let r=0;r<numRounds;r++){
    const current=[fixed,...rotating];
    const matches=[];
    for(let i=0;i<half;i++){
      const a=current[i], b=current[n-1-i];
      if(a!=="BYE" && b!=="BYE") matches.push({a,b,played:false});
    }
    rounds.push(matches);
    rotating.unshift(rotating.pop());
  }
  return rounds;
}

function generateEliminationBracket(list){
  const n=list.length;
  const shuffled=shuffle(list);
  const rounds=[];
  const round1=[];
  for(let i=0;i<n/2;i++) round1.push({a:shuffled[2*i], b:shuffled[2*i+1], played:false});
  rounds.push(round1);
  const numRounds=Math.log2(n);
  let matchesInRound=n/4;
  for(let r=2;r<=numRounds;r++){
    const arr=[];
    for(let i=0;i<matchesInRound;i++) arr.push({a:null,b:null,played:false});
    rounds.push(arr);
    matchesInRound/=2;
  }
  return rounds;
}
function advanceRound(rounds, roundIndex, winners){
  const next=rounds[roundIndex+1];
  for(let i=0;i<winners.length/2;i++){
    next[i].a=winners[2*i];
    next[i].b=winners[2*i+1];
  }
}

function buildSchedule(entities){
  const n=entities.length;
  if(n%2!==0){
    const rrRounds=generateRoundRobin(entities);
    return {kind:"rr", rounds:rrRounds, rrTotal:rrRounds.length};
  }
  if(isPowerOfTwo(n)) return {kind:"elim", rounds:generateEliminationBracket(entities)};
  const k=v2(n);
  const shuffled=shuffle(entities);
  const rounds=[];
  const round1=[];
  for(let i=0;i<shuffled.length/2;i++) round1.push({a:shuffled[2*i], b:shuffled[2*i+1], played:false});
  rounds.push(round1);
  let remaining=shuffled.length/2;
  for(let r=2;r<=k;r++){
    const arr=[];
    for(let i=0;i<remaining/2;i++) arr.push({a:null,b:null,played:false});
    rounds.push(arr);
    remaining/=2;
  }
  return {kind:"hybrid", rounds, k};
}

function buildForbiddenMap(pairs, codeMap){
  const forbidden={};
  pairs.forEach(([nameX,nameY])=>{
    const cx=codeMap[nameX], cy=codeMap[nameY];
    (forbidden[cx]=forbidden[cx]||new Set()).add(cy);
    (forbidden[cy]=forbidden[cy]||new Set()).add(cx);
  });
  return forbidden;
}
function backtrackPairing(codes, used, forbidden, teams){
  if(used.size===codes.length) return true;
  const a=codes.find(c=>!used.has(c));
  let candidates=codes.filter(c=>!used.has(c) && c!==a && !(forbidden[a]&&forbidden[a].has(c)));
  candidates=shuffle(candidates);
  for(const b of candidates){
    used.add(a); used.add(b); teams.push([a,b]);
    if(backtrackPairing(codes,used,forbidden,teams)) return true;
    teams.pop(); used.delete(a); used.delete(b);
  }
  return false;
}
function pairIntoTeamsWithConstraints(codes, forbidden){
  const shuffled=shuffle(codes);
  const used=new Set(), teams=[];
  const ok=backtrackPairing(shuffled, used, forbidden, teams);
  if(!ok) return null;
  return teams.map(([a,b])=>({code:a+"-"+b, members:[a,b]}));
}

function initTable(entities){
  const t={};
  entities.forEach(code=>{ t[code]={code, wins:0, losses:0, pf:0, pa:0, diff:0}; });
  return t;
}
function updateTable(table, a, sa, b, sb){
  table[a].pf+=sa; table[a].pa+=sb;
  table[b].pf+=sb; table[b].pa+=sa;
  if(sa>sb){ table[a].wins++; table[b].losses++; } else { table[b].wins++; table[a].losses++; }
  table[a].diff=table[a].pf-table[a].pa;
  table[b].diff=table[b].pf-table[b].pa;
}
function compareTeams(t1,t2){
  if(t1.wins!==t2.wins) return t2.wins-t1.wins;
  if(t1.losses!==t2.losses) return t1.losses-t2.losses;
  return t2.diff-t1.diff;
}
function standingsOf(table, codes){
  return codes.map(c=>table[c]).sort(compareTeams);
}

// ---- Tie-break helpers ----
function tiedGroup(st, startIndex){
  if(startIndex>=st.length) return [];
  const base=st[startIndex];
  return st.filter(t=>t.wins===base.wins && t.losses===base.losses && t.diff===base.diff);
}
function buildTieBreakSchedule(codes){
  if(codes.length<2) return null;
  return buildSchedule(codes);
}
function tieBreakCompleteWinnerOrder(tb){
  if(tb.schedule.kind==='elim') {
    const rounds=tb.schedule.rounds;
    const final=rounds[rounds.length-1];
    if(final && final[0] && final[0].played) {
      return [final[0].winner, final[0].winner===final[0].a ? final[0].b : final[0].a];
    }
    return null;
  }
  if(tb.schedule.kind==='hybrid') {
    const rounds=tb.schedule.rounds;
    const final=rounds[rounds.length-1];
    if(final && final[0] && final[0].isFinal && final[0].played) {
      return [final[0].winner, final[0].winner===final[0].a ? final[0].b : final[0].a];
    }
    return null;
  }
  const rrRounds=tb.schedule.rounds;
  const last=rrRounds[rrRounds.length-1];
  if(last && last[0] && last[0].isFinal) {
    if(!last[0].played) return null;
    const winner=last[0].winner;
    const loser=winner===last[0].a ? last[0].b : last[0].a;
    const st=standingsOf(S.table,tb.candidates);
    return [winner, loser, ...st.map(t=>t.code).filter(c=>c!==winner&&c!==loser)];
  }
  return null;
}

/* ============================================================
   APP STATE (single shared game — one tournament per server run)
   ============================================================ */

function createInitialState(){
  return {
    step:"roster",
    names:[],
    codeMap:{}, codeToName:{},
    mode:null,
    forbidden:[],
    entities:[],
    labelOf:{},
    matchInfo:null,
    schedule:null,
    roundIndex:0,
    table:{},
    champion:null,
    tieBreak:null,
    decision:null,
    errorMsg:""
  };
}

let S = createInitialState();
function getState(){ return S; }

/* ============================================================
   STEP TRANSITIONS — same rules as the original app, driven by
   explicit arguments instead of reading the DOM.
   ============================================================ */

function reset(){ S = createInitialState(); }

function submitRoster(raw){
  const names=[...new Set(String(raw||"").split("\n").map(s=>s.trim()).filter(Boolean))];
  if(names.length<3) throw new Error("Enter at least 3 player names.");
  const {codeMap, codeToName}=assignCodes(names);
  S.names=names; S.codeMap=codeMap; S.codeToName=codeToName;
  if(names.length%2!==0){
    S.mode="single";
    S.entities=Object.values(codeMap);
    S.labelOf=Object.fromEntries(names.map(n=>[codeMap[n], n]));
    goToDraw();
  } else {
    S.step="mode";
  }
}

function pickMode(mode){
  S.mode=mode;
  if(mode==="single"){
    S.entities=Object.values(S.codeMap);
    S.labelOf=Object.fromEntries(S.names.map(n=>[S.codeMap[n], n]));
    goToDraw();
  } else {
    S.step="pairing";
  }
}

function addForbidden(x,y){
  if(!x||!y||x===y) return;
  const exists=S.forbidden.some(([a,b])=>(a===x&&b===y)||(a===y&&b===x));
  if(!exists) S.forbidden.push([x,y]);
}
function removeForbidden(i){ S.forbidden.splice(i,1); }

function formTeams(){
  const codes=Object.values(S.codeMap);
  const forbidden=buildForbiddenMap(S.forbidden, S.codeMap);
  const teams=pairIntoTeamsWithConstraints(codes, forbidden);
  if(!teams){
    S.errorMsg="No valid team arrangement exists with the current 'never together' rules. Remove a constraint and try again.";
    return;
  }
  S.errorMsg="";
  S.entities=teams.map(t=>t.code);
  S.labelOf={};
  teams.forEach(t=>{
    const label=t.members.map(c=>S.codeToName[c]).join(" & ");
    S.labelOf[t.code]=label;
  });
  S.step="teamsFormed";
}

function goToPairing(){ S.step="pairing"; }

function goToDraw(){
  const info=countMatches(S.entities.length);
  S.matchInfo=info;
  if(info.matches>21){
    S.step="toomany";
    return;
  }
  S.schedule=buildSchedule(S.entities);
  S.table=initTable(S.entities);
  S.tieBreak=null;
  S.roundIndex=0;
  S.step="play";
}

/* ---- Playing a round ---- */

function saveScore(mi, sa, sb){
  const round=S.schedule.rounds[S.roundIndex];
  const m=round[mi];
  if(!m) throw new Error("That match doesn't exist.");
  // sa/sb travel over JSON, where NaN becomes null — treat anything that
  // isn't a genuine finite number the same as an invalid score.
  const bad = typeof sa!=="number" || typeof sb!=="number" || !Number.isFinite(sa) || !Number.isFinite(sb);
  if(bad || sa===sb) throw new Error("Enter two different, valid scores.");
  m.scoreA=sa; m.scoreB=sb; m.played=true;
  m.winner = sa>sb ? m.a : m.b;
  updateTable(S.table, m.a, sa, m.b, sb);
}

function draftScore(mi, which, value){
  const round=S.schedule.rounds[S.roundIndex];
  const m=round[mi];
  if(!m) return;
  if(which==="a") m.draftA=value; else m.draftB=value;
}

function roundComplete(round){ return round.every(m=>m.played); }

function continueTournament(){
  const sched=S.schedule, idx=S.roundIndex, round=sched.rounds[idx];

  if(S.tieBreak){
    const tb=S.tieBreak;
    const baseRounds=tb.schedule.rounds;
    const baseLast=baseRounds.length-1;

    if(tb.schedule.kind==='elim'){
      if(idx===tb.start+baseLast){
        const order=tieBreakCompleteWinnerOrder(tb);
        if(!order) return;
        finishTieBreak(order);
      } else {
        const winners=round.map(m=>m.winner);
        round.eliminated=round.map(m=>m.winner===m.a?m.b:m.a);
        advanceRound(S.schedule.rounds,idx,winners);
      }
    } else if(tb.schedule.kind==='hybrid'){
      const localIdx=idx-tb.start;
      if(tb.stage==='hybrid' && localIdx<tb.schedule.k-1){
        const winners=round.map(m=>m.winner);
        round.eliminated=round.map(m=>m.winner===m.a?m.b:m.a);
        advanceRound(S.schedule.rounds,idx,winners);
      } else if(tb.stage==='hybrid' && localIdx===tb.schedule.k-1){
        const survivors=round.map(m=>m.winner);
        round.eliminated=round.map(m=>m.winner===m.a?m.b:m.a);
        tb.survivors=survivors;
        const rrRounds=generateRoundRobin(survivors);
        tb.stage='hybrid-rr';
        tb.rrStart=S.schedule.rounds.length;
        tb.rrCount=rrRounds.length;
        S.schedule.rounds.push(...rrRounds);
      } else if(tb.stage==='hybrid-rr'){
        const rrIndex=idx-tb.rrStart;
        if(rrIndex===tb.rrCount-1){
          const st=standingsOf(S.table,tb.survivors);
          const group=tiedGroup(st,0);
          if(group.length===st.length){
            const rrRounds=generateRoundRobin(tb.survivors);
            tb.rrStart=S.schedule.rounds.length;
            tb.rrCount=rrRounds.length;
            S.schedule.rounds.push(...rrRounds);
          } else {
            finishTieBreak(st.map(t=>t.code));
          }
        }
      }
    } else if(tb.schedule.kind==='rr'){
      const rrIndex=idx-tb.start;
      if(rrIndex===tb.rrCount-1){
        const st=standingsOf(S.table,tb.candidates);
        const group=tiedGroup(st,0);
        if(group.length===st.length){
          const rrRounds=generateRoundRobin(tb.candidates);
          tb.start=S.schedule.rounds.length;
          tb.rrStart=tb.start;
          tb.rrCount=rrRounds.length;
          S.schedule.rounds.push(...rrRounds);
        } else {
          finishTieBreak(st.map(t=>t.code));
        }
      }
    }
  } else if(sched.kind==='elim'){
    const winners=round.map(m=>m.winner);
    round.eliminated=round.map(m=>m.winner===m.a?m.b:m.a);
    if(idx+1<sched.rounds.length) advanceRound(sched.rounds,idx,winners);
    else S.champion=winners[0];
  }
  else if(sched.kind==='hybrid'){
    if(round[0] && round[0].isFinal){
      S.champion=round[0].winner;
    } else if(idx<sched.k-1){
      const winners=round.map(m=>m.winner);
      round.eliminated=round.map(m=>m.winner===m.a?m.b:m.a);
      advanceRound(sched.rounds,idx,winners);
    } else if(idx===sched.k-1){
      const survivors=round.map(m=>m.winner);
      round.eliminated=round.map(m=>m.winner===m.a?m.b:m.a);
      sched.survivors=survivors;
      sched.rrStart=sched.rounds.length;
      const rrRounds=generateRoundRobin(survivors);
      sched.rrCount=rrRounds.length;
      sched.rounds.push(...rrRounds);
    } else {
      const rrIndex=idx-sched.rrStart;
      if(rrIndex===sched.rrCount-1){
        startRoundRobinDecision(sched.survivors);
        if(S.tieBreak){ return; }
      }
    }
  }
  else if(sched.kind==='rr'){
    if(round[0] && round[0].isFinal){
      S.champion=round[0].winner;
    } else if(idx===sched.rrTotal-1){
      startRoundRobinDecision();
      if(S.tieBreak){ return; }
    }
  }

  if(idx+1>=sched.rounds.length){
    S.step='standings';
  } else {
    S.roundIndex=idx+1;
  }
}

function startTieBreak(candidates,target){
  const clean=[...new Set(candidates)];
  if(clean.length<=target){
    return clean;
  }
  S.tieBreak={stage:null,candidates:clean,target,schedule:null,start:0,rrStart:0,rrCount:0};
  const ts=buildTieBreakSchedule(clean);
  if(!ts) return null;
  S.tieBreak.schedule=ts;
  S.tieBreak.stage=ts.kind;
  S.tieBreak.start=S.schedule.rounds.length;
  S.tieBreak.rrStart=S.tieBreak.start;
  S.tieBreak.rrCount=ts.rounds.length;
  S.schedule.rounds.push(...ts.rounds);
  S.roundIndex=S.tieBreak.start;
  return null;
}

function markRoundRobinOut(qualifiers, rrCodes){
  const keep=new Set(qualifiers);
  const participants=rrCodes || (S.schedule.kind==='rr' ? S.entities : S.schedule.survivors);
  const roundIndex=S.schedule.kind==='rr'
    ? S.schedule.rrTotal-1
    : (S.schedule.rrStart!=null ? S.schedule.rrStart+S.schedule.rrCount-1 : -1);
  if(roundIndex<0 || !S.schedule.rounds[roundIndex]) return;
  const round=S.schedule.rounds[roundIndex];
  const already=new Set(round.eliminated||[]);
  participants.forEach(c=>{
    if(!keep.has(c)) already.add(c);
  });
  round.eliminated=[...already];
}

function finishTieBreak(order){
  const tb=S.tieBreak;
  const unique=order.filter((c,i,a)=>c && a.indexOf(c)===i);
  const qualifiers=unique.slice(0,tb.target);
  const outside=tb.candidates.filter(c=>!qualifiers.includes(c));

  const current=S.schedule.rounds[S.roundIndex];
  current.eliminated=[...(current.eliminated||[]),...outside];
  tb.result=qualifiers;
  tb.done=true;

  if(tb.context==='top2'){
    markRoundRobinOut(qualifiers.slice(0,2), tb.rrParticipants);
  } else if(tb.context==='second'){
    markRoundRobinOut([S.decision.first,qualifiers[0]], tb.rrParticipants);
  }

  const context=tb.context;
  S.tieBreak=null;
  if(context==='top2'){
    S.schedule.rounds.push([{a:qualifiers[0],b:qualifiers[1],played:false,isFinal:true}]);
  } else if(context==='second'){
    const first=S.decision.first;
    S.schedule.rounds.push([{a:first,b:qualifiers[0],played:false,isFinal:true}]);
  }
}

function startRoundRobinDecision(rrParticipants){
  const participants=rrParticipants || S.entities;
  const st=standingsOf(S.table,participants);
  if(st.length<2) return;

  const topGroup=tiedGroup(st,0);

  if(topGroup.length>=2){
    const result=startTieBreak(topGroup.map(t=>t.code),2);
    if(result){
      markRoundRobinOut(result.slice(0,2),participants);
      S.schedule.rounds.push([{a:result[0],b:result[1],played:false,isFinal:true}]);
    } else {
      S.tieBreak.context='top2';
      S.tieBreak.rrParticipants=participants.slice();
    }
    return;
  }

  const secondGroup=tiedGroup(st,1);
  if(secondGroup.length<=1){
    markRoundRobinOut([st[0].code,st[1].code],participants);
    S.schedule.rounds.push([{a:st[0].code,b:st[1].code,played:false,isFinal:true}]);
    return;
  }

  const result=startTieBreak(secondGroup.map(t=>t.code),1);
  if(result){
    markRoundRobinOut([st[0].code,result[0]],participants);
    S.schedule.rounds.push([{a:st[0].code,b:result[0],played:false,isFinal:true}]);
  } else {
    S.decision={first:st[0].code};
    S.tieBreak.context='second';
    S.tieBreak.rrParticipants=participants.slice();
  }
}

module.exports = {
  getState,
  reset,
  submitRoster,
  pickMode,
  addForbidden,
  removeForbidden,
  formTeams,
  goToPairing,
  goToDraw,
  saveScore,
  draftScore,
  continueTournament,
  roundComplete
};
