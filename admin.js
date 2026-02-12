import { db, ref, set, onValue, update, remove } from "./firebase-config.js";

const VERSION = "4.7.1";

// Footer Unit (Version + Credit)
const footer = document.createElement('footer');
footer.className = "fixed bottom-0 left-0 w-full py-2 bg-black/80 backdrop-blur-md border-t border-white/5 text-center z-[5000]";
footer.innerHTML = `<p class="text-[9px] tracking-[0.3em] font-black text-white/20 uppercase">Admin v${VERSION} · by Julian Scherer</p>`;
document.body.appendChild(footer);

const adminHeaderVersion = document.getElementById('admin-header-version');
if (adminHeaderVersion) adminHeaderVersion.textContent = `Version ${VERSION}`;

const adminRoundStatus = document.getElementById('admin-round-status');

const playerListDiv = document.getElementById('admin-player-list');
const roundTimerDisplay = document.getElementById('round-timer');
const playerTimerDisplay = document.getElementById('player-timer');
const startRoundBtn = document.getElementById('start-round-btn');
const pauseRoundBtn = document.getElementById('pause-round-btn');
const resumeRoundBtn = document.getElementById('resume-round-btn');
const stopRoundBtn = document.getElementById('stop-round-btn');
const startVoteBtn = document.getElementById('start-vote-btn');
const revealVoteBtn = document.getElementById('reveal-vote-btn');
const endVoteBtn = document.getElementById('end-vote-btn');
const hideVoteBtn = document.getElementById('hide-vote-btn');
const adminVoteStats = document.getElementById('admin-vote-stats');
const adminVoteChart = document.getElementById('admin-vote-chart');
const resetDbBtn = document.getElementById('reset-db');
const nextPlayerBtn = document.getElementById('next-player-btn');

let roundInterval = null, playerInterval = null, voteInterval = null;
let currentRoundTime = 150, currentPlayerTime = 30, currentVoteTime = 60;
let lastActiveId = null;

const formatTime = (t) => {
    const m = Math.floor(t / 60); const s = t % 60;
    return `${m}:${s < 10 ? '0' + s : s}`;
};

// --- TIMER ENGINE ---
function startLogic() {
    if (roundInterval) clearInterval(roundInterval);
    if (playerInterval) clearInterval(playerInterval);
    
    roundInterval = setInterval(() => {
        if (currentRoundTime > 0) {
            currentRoundTime--;
            update(ref(db, 'gameState'), { roundTimer: currentRoundTime });
        }
    }, 1000);

    playerInterval = setInterval(() => {
        if (currentPlayerTime > 0) {
            currentPlayerTime--;
            update(ref(db, 'gameState'), { playerTimer: currentPlayerTime });
            if (currentPlayerTime === 0) window.skipPlayer();
        }
    }, 1000);
}

function stopLogic() {
    clearInterval(roundInterval);
    clearInterval(playerInterval);
    roundInterval = null;
    playerInterval = null;
}

function startVoteTimer() {
    if (voteInterval) clearInterval(voteInterval);
    voteInterval = setInterval(() => {
        if (currentVoteTime > 0) {
            currentVoteTime--;
            update(ref(db, 'gameState'), { voteTimer: currentVoteTime });
        } else {
            clearInterval(voteInterval);
            voteInterval = null;
            update(ref(db, 'gameState'), { votingActive: false, votingFinished: true });
        }
    }, 1000);
}

function stopVoteTimer() {
    if (voteInterval) clearInterval(voteInterval);
    voteInterval = null;
}

// --- SYNC ---
onValue(ref(db), (snap) => {
    const data = snap.val(); if (!data) return;
    const gs = data.gameState || {}; const players = data.players || {};

    currentRoundTime = gs.roundTimer !== undefined ? gs.roundTimer : currentRoundTime;
    currentPlayerTime = gs.playerTimer !== undefined ? gs.playerTimer : currentPlayerTime;
    currentVoteTime = gs.voteTimer !== undefined ? gs.voteTimer : currentVoteTime;
    roundTimerDisplay.innerText = formatTime(currentRoundTime);
    playerTimerDisplay.innerText = currentPlayerTime;

    // Admin: Pause/Ende sichtbar
    if (adminRoundStatus) {
        if (gs.active && gs.isPaused) {
            adminRoundStatus.textContent = "⏸ Pausiert";
            adminRoundStatus.className = "text-[9px] font-black uppercase px-3 py-1 rounded-full bg-amber-900/50 text-amber-200 border border-amber-500/50";
        } else if (gs.active) {
            adminRoundStatus.textContent = "▶ Läuft";
            adminRoundStatus.className = "text-[9px] font-black uppercase px-3 py-1 rounded-full bg-red-900/30 text-red-200 border border-red-500/50";
        } else {
            adminRoundStatus.textContent = "■ Beendet";
            adminRoundStatus.className = "text-[9px] font-black uppercase px-3 py-1 rounded-full bg-white/10 text-white/50 border border-white/20";
        }
    }

    // Button States (Runde) – bei Pause Timer wirklich stoppen
    if (gs.active) {
        if (gs.isPaused) {
            stopLogic();
            startRoundBtn.classList.add('hidden');
            pauseRoundBtn.classList.add('hidden');
            resumeRoundBtn.classList.remove('hidden');
            stopRoundBtn.classList.remove('hidden');
        } else {
            if (!roundInterval) startLogic();
            startRoundBtn.classList.add('hidden');
            pauseRoundBtn.classList.remove('hidden');
            resumeRoundBtn.classList.add('hidden');
            stopRoundBtn.classList.remove('hidden');
        }
    } else {
        stopLogic();
        startRoundBtn.classList.remove('hidden');
        startRoundBtn.innerText = "RUNDE STARTEN";
        pauseRoundBtn.classList.add('hidden');
        resumeRoundBtn.classList.add('hidden');
        stopRoundBtn.classList.add('hidden');
    }

    // Button States (Voting)
    if (gs.votingActive) {
        // Prüfe ob alle Spieler abgestimmt haben
        const votes = data.votes || {};
        const alivePlayers = Object.keys(players).filter(id => players[id].lives > 0);
        const votedPlayers = Object.keys(votes);
        
        if (alivePlayers.length > 0 && alivePlayers.length === votedPlayers.length) {
            // Alle haben abgestimmt - automatisch beenden
            stopVoteTimer();
            update(ref(db, 'gameState'), {
                votingActive: false,
                votingFinished: true,
                voteTimer: currentVoteTime
            });
        } else {
            startVoteBtn.innerText = `Voting läuft… (${votedPlayers.length}/${alivePlayers.length})`;
            startVoteBtn.disabled = true;
            endVoteBtn.classList.remove('hidden');
            revealVoteBtn.classList.add('hidden');
            hideVoteBtn.classList.add('hidden');
            if (!voteInterval) startVoteTimer();
        }
    } else {
        startVoteBtn.disabled = false;
        endVoteBtn.classList.add('hidden');
        stopVoteTimer();
        if (gs.votingFinished) {
            startVoteBtn.innerText = "Voting erneut starten";
            revealVoteBtn.classList.remove('hidden');
            hideVoteBtn.classList.add('hidden');
        } else if (gs.showResults) {
            startVoteBtn.innerText = "Voting neu starten";
            revealVoteBtn.classList.add('hidden');
            hideVoteBtn.classList.remove('hidden');
        } else {
            startVoteBtn.innerText = "1. Voting öffnen";
            revealVoteBtn.classList.add('hidden');
            hideVoteBtn.classList.add('hidden');
        }
    }

    // Spielerliste mit Reihenfolge (playerOrder) + Drag & Drop
    const order = gs.playerOrder && Array.isArray(gs.playerOrder) ? [...gs.playerOrder] : [];
    const allIds = Object.keys(players);
    allIds.forEach(pid => { if (!order.includes(pid)) order.push(pid); });

    playerListDiv.innerHTML = '';
    order.forEach(id => {
        if (!players[id]) return;
        const p = players[id];
        if (p.isDran) lastActiveId = id;
        const isDead = p.lives <= 0;
        const card = document.createElement('div');
        card.className = `p-4 rounded-2xl border transition-all select-none ${p.isDran ? 'border-red-600 bg-red-900/20 ring-2' : 'border-white/10 bg-white/5'} ${isDead ? 'opacity-60' : ''}`;
        card.draggable = !isDead;
        card.dataset.playerId = id;
        const hearts = p.lives > 0 ? "❤️".repeat(p.lives) : "☠️";
        const jokerStar = p.jokerUsed ? "☆" : "⭐";
        card.innerHTML = `
            <div class="flex justify-between items-center mb-3">
                <span class="font-black uppercase text-white">${p.name}</span>
                <span class="text-red-500 font-bold flex items-center gap-0.5">${hearts} <span class="text-yellow-400/90">${jokerStar}</span></span>
            </div>
            <div class="grid grid-cols-2 gap-2">
                ${isDead
                    ? `<button onclick="window.revivePlayer('${id}')" class="col-span-2 bg-emerald-600 hover:bg-emerald-500 text-[9px] py-2 rounded font-bold text-white uppercase">Wiederbeleben</button>`
                    : `<button onclick="window.setDran('${id}')" class="bg-blue-600 text-[9px] py-2 rounded font-bold text-white uppercase italic">An die Reihe</button>
                       <button onclick="window.resetJoker('${id}')" class="bg-yellow-600 text-[9px] py-2 rounded font-bold text-black uppercase">Joker Reset</button>
                       <button onclick="window.changeLives('${id}', -1)" class="bg-red-600 py-1 rounded text-white text-[9px]">-1 HP</button>
                       <button onclick="window.changeLives('${id}', 1)" class="bg-green-600 py-1 rounded text-white text-[9px]">+1 HP</button>`
                }
            </div>`;
        playerListDiv.appendChild(card);
    });

    // Drag & Drop für Reihenfolge
    let draggedId = null;
    playerListDiv.querySelectorAll('[data-player-id]').forEach(el => {
        if (el.draggable === false) return;
        el.addEventListener('dragstart', e => { draggedId = el.dataset.playerId; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', el.dataset.playerId); });
        el.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; el.classList.add('ring-2', 'ring-blue-500'); });
        el.addEventListener('dragleave', () => el.classList.remove('ring-2', 'ring-blue-500'));
        el.addEventListener('drop', e => {
            e.preventDefault();
            el.classList.remove('ring-2', 'ring-blue-500');
            const targetId = el.dataset.playerId;
            if (!draggedId || draggedId === targetId) return;
            const newOrder = order.filter(x => x !== draggedId);
            const targetIdx = newOrder.indexOf(targetId);
            newOrder.splice(targetIdx, 0, draggedId);
            update(ref(db, 'gameState'), { playerOrder: newOrder });
            draggedId = null;
        });
    });

    // Admin-Voting: Live-Balkendiagramm (während Vote + danach)
    const votes = data.votes || {};
    const totalVotes = Object.keys(votes).length;
    const showChart = gs.votingActive || gs.votingFinished || gs.showResults;

    adminVoteChart.innerHTML = "";
    adminVoteStats.innerHTML = "";

    if (showChart) {
        const aliveIds = Object.keys(players).filter(id => players[id].lives > 0);
        const countByPlayer = {};
        aliveIds.forEach(id => { countByPlayer[id] = 0; });
        Object.values(votes).forEach(votedId => {
            if (countByPlayer[votedId] !== undefined) countByPlayer[votedId]++;
        });
        const maxCount = Math.max(1, ...Object.values(countByPlayer));

        aliveIds.forEach(id => {
            const count = countByPlayer[id];
            const pct = maxCount ? Math.round((count / maxCount) * 100) : 0;
            const bar = document.createElement('div');
            bar.className = "space-y-0.5";
            bar.innerHTML = `
                <div class="flex justify-between text-[9px] font-bold uppercase text-white/80">
                    <span>${players[id].name}</span>
                    <span class="text-blue-400">${count} ${count === 1 ? 'Stimme' : 'Stimmen'}</span>
                </div>
                <div class="w-full h-4 bg-white/10 rounded-full overflow-hidden border border-white/10">
                    <div class="h-full bg-blue-600 rounded-full transition-all duration-300" style="width: ${pct}%"></div>
                </div>
            `;
            adminVoteChart.appendChild(bar);
        });

        if (gs.votingFinished || gs.showResults) {
            adminVoteStats.innerHTML = `<div class="text-white/50 uppercase font-black">Stimmen gesamt: ${totalVotes}</div>`;
            if (gs.votingTie) adminVoteStats.innerHTML = `<div class="text-amber-400 text-xs font-black uppercase mb-1">⚔ STECHEN – Neuwählen</div>` + adminVoteStats.innerHTML;
        }
    }
});

// --- HELPER FUNCTIONS ---
window.setDran = (id) => {
    onValue(ref(db, 'players'), (snap) => {
        const players = snap.val();
        const updates = {};
        Object.keys(players).forEach(pId => {
            updates[`players/${pId}/isDran`] = (pId === id);
        });
        updates['gameState/playerTimer'] = 30;
        update(ref(db), updates);
    }, { onlyOnce: true });
};

window.resetJoker = (id) => update(ref(db, `players/${id}`), { jokerUsed: false });
window.revivePlayer = (id) => update(ref(db, `players/${id}`), { lives: 3, jokerUsed: false });
window.changeLives = (id, amount) => {
    onValue(ref(db, `players/${id}/lives`), (s) => {
        update(ref(db, `players/${id}`), { lives: Math.max(0, (s.val() || 0) + amount) });
    }, { onlyOnce: true });
};

startRoundBtn.onclick = () => {
    stopVoteTimer();
    remove(ref(db, 'votes'));
    update(ref(db, 'gameState'), {
        active: true,
        isPaused: false,
        roundTimer: 150,
        playerTimer: 30,
        votingActive: false,
        votingFinished: false,
        showResults: false,
        votingTie: false,
        voteTimer: 60
    });
    onValue(ref(db), (s) => {
        const data = s.val() || {};
        const p = data.players || {};
        const order = (data.gameState && data.gameState.playerOrder) || Object.keys(p);
        const ids = [...order].filter(id => p[id]);
        const hasDran = ids.some(id => p[id].isDran);
        const firstAlive = ids.find(id => (p[id].lives || 0) > 0);
        if (!hasDran && firstAlive) window.setDran(firstAlive);
    }, { onlyOnce: true });
};

pauseRoundBtn.onclick = () => {
    update(ref(db, 'gameState'), { isPaused: true });
};

resumeRoundBtn.onclick = () => {
    update(ref(db, 'gameState'), { isPaused: false });
};

stopRoundBtn.onclick = () => {
    stopLogic();
    update(ref(db, 'gameState'), { active: false, isPaused: false, roundTimer: 150, playerTimer: 30 });
    currentRoundTime = 150;
    currentPlayerTime = 30;
};

// --- RICHTIG / FALSCH & NÄCHSTER SPIELER ---
function goToNextPlayer({ penalizeCurrent = false, flash = null } = {}) {
    onValue(ref(db), (snap) => {
        const data = snap.val() || {};
        const players = data.players || {};
        const order = (data.gameState && data.gameState.playerOrder) || Object.keys(players);
        const ids = [...order].filter(id => players[id]);
        if (ids.length === 0) return;

        let currentId = ids.find(id => players[id].isDran) || lastActiveId || ids[0];
        let currentIndex = ids.indexOf(currentId);
        if (currentIndex === -1) currentIndex = 0;

        const updates = {};

        // optional Leben abziehen
        if (penalizeCurrent && currentId && players[currentId]) {
            const newLives = Math.max(0, (players[currentId].lives || 0) - 1);
            updates[`players/${currentId}/lives`] = newLives;
        }

        // alle erstmal nicht dran
        ids.forEach(id => {
            updates[`players/${id}/isDran`] = false;
        });

        // nächsten lebenden Spieler suchen
        let nextId = null;
        for (let i = 1; i <= ids.length; i++) {
            const idx = (currentIndex + i) % ids.length;
            const candidateId = ids[idx];
            if ((players[candidateId].lives || 0) > 0) {
                nextId = candidateId;
                break;
            }
        }

        if (!nextId) nextId = currentId; // Fallback, falls alle tot

        updates[`players/${nextId}/isDran`] = true;
        updates['gameState/playerTimer'] = 30;
        if (flash) {
            updates['gameState/flashEffect'] = flash;
        }

        update(ref(db), updates).then(() => {
            if (flash) {
                setTimeout(() => {
                    update(ref(db, 'gameState'), { flashEffect: null });
                }, 1200);
            }
        });
    }, { onlyOnce: true });
}

window.answerAndNext = (isCorrect) => {
    // Bei Falsch wird KEIN Herz abgezogen – nur im Voting verliert man ein Leben
    goToNextPlayer({ penalizeCurrent: false, flash: isCorrect ? 'correct' : 'wrong' });
};

window.skipPlayer = () => {
    goToNextPlayer({ penalizeCurrent: false, flash: null });
};

nextPlayerBtn.onclick = () => window.skipPlayer();

// --- VOTING-KONTROLLE ---
startVoteBtn.onclick = () => {
    currentVoteTime = 60;
    stopVoteTimer();
    remove(ref(db, 'votes'));
    update(ref(db, 'gameState'), {
        votingActive: true,
        votingFinished: false,
        showResults: false,
        votingTie: false,
        voteTimer: currentVoteTime
    });
};

endVoteBtn.onclick = () => {
    stopVoteTimer();
    update(ref(db, 'gameState'), {
        votingActive: false,
        votingFinished: true,
        voteTimer: 0
    });
};

revealVoteBtn.onclick = () => {
    onValue(ref(db), (snap) => {
        const data = snap.val() || {};
        const players = data.players || {};
        const votes = data.votes || {};
        const gs = data.gameState || {};

        const aliveIds = Object.keys(players).filter(id => (players[id].lives || 0) > 0);
        const voteCounts = {};
        aliveIds.forEach(id => { voteCounts[id] = 0; });
        Object.values(votes).forEach(votedId => {
            if (voteCounts[votedId] !== undefined) voteCounts[votedId]++;
        });

        const counts = Object.entries(voteCounts).map(([id, c]) => ({ id, c }));
        const maxCount = counts.length ? Math.max(...counts.map(x => x.c)) : 0;
        const losers = counts.filter(x => x.c === maxCount).map(x => x.id);

        if (losers.length === 1 && aliveIds.length > 1) {
            const newLives = Math.max(0, (players[losers[0]].lives || 0) - 1);
            update(ref(db, `players/${losers[0]}`), { lives: newLives });
            update(ref(db, 'gameState'), {
                votingTie: false,
                votingActive: false,
                votingFinished: false,
                showResults: true,
                voteTimer: 0
            });
        } else {
            // Stichen: Erst Votes löschen, dann Neuwahl starten – sonst beendet Sync das Voting sofort wieder
            stopVoteTimer();
            currentVoteTime = 60;
            const tieUpdates = {
                votingTie: false,
                votingActive: true,
                votingFinished: false,
                showResults: false,
                voteTimer: 60
            };
            remove(ref(db, 'votes')).then(() => {
                update(ref(db, 'gameState'), tieUpdates);
            });
        }
    }, { onlyOnce: true });
};

hideVoteBtn.onclick = () => {
    update(ref(db, 'gameState'), {
        votingActive: false,
        votingFinished: false,
        showResults: false,
        votingTie: false
    });
};

// --- HARD RESET ---
resetDbBtn.onclick = () => {
    if (!confirm('Wirklich alle Spieler, Votes und Spielstand löschen?')) return;
    Promise.all([
        remove(ref(db, 'players')),
        remove(ref(db, 'votes')),
        set(ref(db, 'gameState'), {
            active: false,
            isPaused: false,
            roundTimer: 150,
            playerTimer: 30,
            flashEffect: null,
            votingActive: false,
            votingFinished: false,
            showResults: false,
            votingTie: false,
            voteTimer: 60
        })
    ]);
};
