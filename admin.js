import { db, ref, set, onValue, update, remove } from "./firebase-config.js";

const VERSION = "4.86";

// Footer Unit (Version + Credit)
const footer = document.createElement('footer');
footer.className = "fixed bottom-0 left-0 w-full py-2 bg-black/80 backdrop-blur-md border-t border-white/5 text-center z-[5000]";
footer.innerHTML = `<p class="text-[9px] tracking-[0.3em] font-black text-white/20 uppercase">Admin v${VERSION} · by Julian Scherer</p>`;
document.body.appendChild(footer);

const adminHeaderVersion = document.getElementById('admin-header-version');
if (adminHeaderVersion) adminHeaderVersion.textContent = `Version ${VERSION}`;

const adminRoundStatus = document.getElementById('admin-round-status');
const modeIndicator = document.getElementById('mode-indicator');
const openModeBtn = document.getElementById('open-mode-modal');
const modeModal = document.getElementById('mode-modal');
const modeTimeRadio = document.getElementById('mode-time');
const modeQuestionsRadio = document.getElementById('mode-questions');
const timeMinutesInput = document.getElementById('time-minutes');
const timeSecondsInput = document.getElementById('time-seconds');
const maxQuestionsInput = document.getElementById('max-questions');
const modeCancelBtn = document.getElementById('mode-cancel');
const modeSaveBtn = document.getElementById('mode-save');

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
const questionTextEl = document.getElementById('question-text');
const questionAnswerEl = document.getElementById('question-answer');
const questionProgressEl = document.getElementById('question-progress');
const questionSkipBtn = document.getElementById('question-skip');
const questionDifficultyEl = document.getElementById('question-difficulty');
const diffLightInput = document.getElementById('diff-light');
const diffMediumInput = document.getElementById('diff-medium');
const diffHardInput = document.getElementById('diff-hard');
const questionCategoryFiltersEl = document.getElementById('question-category-filters');
const questionCategoryPanel = document.getElementById('question-category-panel');
const toggleCategoryFiltersBtn = document.getElementById('toggle-category-filters');

let roundInterval = null, playerInterval = null, voteInterval = null;
let currentRoundTime = 150, currentPlayerTime = 30, currentVoteTime = 60;
let lastActiveId = null;
let currentMode = "time";
let currentTimeLimit = 150;
let currentMaxQuestions = 5;
let currentPlayerPerQuestion = 30;
let allQuestions = [];
let questionDeck = [];
let currentQuestionIndex = -1;
let activeDifficulties = { Leicht: true, Mittel: true, Schwer: true };
let activeCategories = null;

const formatTime = (t) => {
    const m = Math.floor(t / 60); const s = t % 60;
    return `${m}:${s < 10 ? '0' + s : s}`;
};

const shuffleArray = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};

function rebuildQuestionDeck() {
    if (!allQuestions || !allQuestions.length) return;
    
    // Bereits verwendete Fragen speichern (wenn bereits Fragen gezeigt wurden)
    const usedQuestions = [];
    const usedQuestionIds = new Set();
    if (currentQuestionIndex >= 0 && questionDeck && questionDeck.length > 0) {
        // Alle bereits verwendeten Fragen sammeln (bis zum aktuellen Index)
        for (let i = 0; i <= currentQuestionIndex && i < questionDeck.length; i++) {
            usedQuestions.push(questionDeck[i]);
            usedQuestionIds.add(questionDeck[i].id);
        }
    }
    
    // Neue Fragen basierend auf aktualisierten Filtern finden
    const filtered = allQuestions.filter(q => {
        const diff = q.schwierigkeit || q.schwierigkeit === "" ? q.schwierigkeit : "Leicht";
        const cat = q.kategorie || "Allgemein";
        const diffOk = activeDifficulties[diff] !== false;
        const catOk = !activeCategories || activeCategories[cat] !== false;
        return diffOk && catOk;
    });
    
    // Wenn bereits Fragen verwendet wurden, neue Fragen hinzufügen (ohne Duplikate)
    if (usedQuestions.length > 0) {
        // Neue Fragen, die noch nicht verwendet wurden
        const newQuestions = filtered.filter(q => !usedQuestionIds.has(q.id));
        // Deck neu zusammenstellen: bereits verwendete + neue Fragen
        questionDeck = [...usedQuestions, ...shuffleArray(newQuestions)];
        // currentQuestionIndex bleibt erhalten (Fortschritt wird nicht zurückgesetzt)
    } else {
        // Keine Fragen verwendet, Deck komplett neu aufbauen
        questionDeck = shuffleArray(filtered);
        currentQuestionIndex = -1;
    }
    
    // Nur wenn keine Fragen verwendet wurden, nächste Frage anzeigen
    if (currentQuestionIndex < 0) {
        showNextQuestion();
    }
}

function showNextQuestion() {
    if (!questionTextEl || !questionAnswerEl || !questionProgressEl) return;
    if (!questionDeck || questionDeck.length === 0) {
        questionTextEl.textContent = "Keine Fragen geladen (Filter zu streng?).";
        questionAnswerEl.textContent = "";
        questionProgressEl.textContent = "";
        if (questionDifficultyEl) {
            questionDifficultyEl.textContent = "–";
            questionDifficultyEl.className = "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-[0.2em] bg-white/10 text-white/40 border border-white/20";
        }
        return;
    }
    currentQuestionIndex++;
    if (currentQuestionIndex >= questionDeck.length) {
        currentQuestionIndex = 0;
    }
    const q = questionDeck[currentQuestionIndex];
    questionTextEl.textContent = q.frage;
    questionAnswerEl.textContent = `Antwort (ID ${q.id}): ${q.antwort}`;
    questionProgressEl.textContent = `Frage ${currentQuestionIndex + 1} von ${questionDeck.length}`;

    if (questionDifficultyEl) {
        const diff = q.schwierigkeit || "Leicht";
        questionDifficultyEl.textContent = diff;
        let base = "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-[0.2em] border ";
        if (diff === "Leicht") {
            questionDifficultyEl.className = base + "bg-emerald-900/40 text-emerald-300 border-emerald-500/40";
        } else if (diff === "Mittel") {
            questionDifficultyEl.className = base + "bg-amber-900/40 text-amber-300 border-amber-500/40";
        } else {
            questionDifficultyEl.className = base + "bg-red-900/40 text-red-300 border-red-500/40";
        }
    }

    // Frage für Spieler im GameState speichern (ohne Antwort)
    update(ref(db, 'gameState'), {
        currentQuestionId: q.id,
        currentQuestionText: q.frage,
        currentQuestionCategory: q.kategorie || null,
        currentQuestionDifficulty: q.schwierigkeit || null
    });
}

// --- TIMER ENGINE ---
function startLogic() {
    if (roundInterval) clearInterval(roundInterval);
    if (playerInterval) clearInterval(playerInterval);

    // Rundentimer nur im Zeit-Modus, Spielertimer immer
    if (currentMode === "time") {
        roundInterval = setInterval(() => {
            if (currentRoundTime > 0) {
                currentRoundTime--;
                update(ref(db, 'gameState'), { roundTimer: currentRoundTime });

                // Wenn die Rundenzeit im Zeit-Modus abläuft, Runde automatisch beenden
                if (currentRoundTime === 0) {
                    stopLogic();
                    update(ref(db, 'gameState'), {
                        active: false,
                        isPaused: false,
                        roundTimer: 0
                    });
                }
            }
        }, 1000);
    }

    playerInterval = setInterval(() => {
        if (currentPlayerTime > 0) {
            currentPlayerTime--;
            update(ref(db, 'gameState'), { playerTimer: currentPlayerTime });
            if (currentPlayerTime === 0) window.skipPlayer();
        }
    }, 1000);
}

// --- FRAGEN-KATALOG LADEN ---
fetch('./fragen.json')
    .then(r => r.json())
    .then(data => {
        if (Array.isArray(data) && data.length) {
            allQuestions = data;
            // Kategorien dynamisch aufbauen
            if (questionCategoryFiltersEl) {
                questionCategoryFiltersEl.innerHTML = "";
                const cats = Array.from(new Set(allQuestions.map(q => q.kategorie || "Allgemein"))).sort();
                activeCategories = {};
                cats.forEach(cat => {
                    activeCategories[cat] = true;
                    const label = document.createElement('label');
                    label.className = "inline-flex items-center gap-1 cursor-pointer";
                    const input = document.createElement('input');
                    input.type = "checkbox";
                    input.checked = true;
                    input.className = "accent-sky-500";
                    input.dataset.category = cat;
                    input.onchange = () => {
                        activeCategories[cat] = input.checked;
                        rebuildQuestionDeck();
                    };
                    const span = document.createElement('span');
                    span.textContent = cat;
                    label.appendChild(input);
                    label.appendChild(span);
                    questionCategoryFiltersEl.appendChild(label);
                });
            }
            rebuildQuestionDeck();
        }
    })
    .catch(() => {
        if (questionTextEl) {
            questionTextEl.textContent = "Fragen konnten nicht geladen werden.";
        }
    });

if (questionSkipBtn) {
    questionSkipBtn.onclick = () => showNextQuestion();
}

// Schwierigkeits-Filter Events
const updateDifficultyFilter = () => {
    activeDifficulties.Leicht = diffLightInput ? diffLightInput.checked : true;
    activeDifficulties.Mittel = diffMediumInput ? diffMediumInput.checked : true;
    activeDifficulties.Schwer = diffHardInput ? diffHardInput.checked : true;
    rebuildQuestionDeck();
};

if (diffLightInput) diffLightInput.onchange = updateDifficultyFilter;
if (diffMediumInput) diffMediumInput.onchange = updateDifficultyFilter;
if (diffHardInput) diffHardInput.onchange = updateDifficultyFilter;

// Kategorien-Panel Toggle
if (toggleCategoryFiltersBtn && questionCategoryPanel) {
    toggleCategoryFiltersBtn.onclick = () => {
        questionCategoryPanel.classList.toggle('hidden');
    };
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
    const settings = data.settings || {};

    currentMode = settings.mode || "time";
    currentTimeLimit = settings.timeLimitSeconds || 150;
    currentMaxQuestions = settings.maxQuestions || 5;
    currentPlayerPerQuestion = settings.playerTimeSeconds || 30;

    currentRoundTime = gs.roundTimer !== undefined ? gs.roundTimer : currentRoundTime;
    currentPlayerTime = gs.playerTimer !== undefined ? gs.playerTimer : currentPlayerTime;
    currentVoteTime = gs.voteTimer !== undefined ? gs.voteTimer : currentVoteTime;
    roundTimerDisplay.innerText = formatTime(currentRoundTime);
    playerTimerDisplay.innerText = currentPlayerTime;

    // Fragen-Modus: automatisch Runde beenden, wenn alle lebenden Spieler keine Fragen mehr haben
    if (currentMode === "questions" && gs.active && !gs.isPaused) {
        const aliveIds = Object.keys(players).filter(id => (players[id].lives || 0) > 0);
        if (aliveIds.length > 0) {
            const someoneHasQuestions = aliveIds.some(id => {
                const q = players[id].questionsLeft;
                return typeof q === "number" ? q > 0 : true;
            });
            if (!someoneHasQuestions) {
                stopLogic();
                update(ref(db, 'gameState'), {
                    active: false,
                    isPaused: false
                });
            }
        }
    }

    // Rundenmodus-UI (Modal) syncen
    if (modeTimeRadio && modeQuestionsRadio) {
        modeTimeRadio.checked = currentMode === "time";
        modeQuestionsRadio.checked = currentMode === "questions";
    }
    if (timeMinutesInput && timeSecondsInput) {
        const mins = Math.floor(currentTimeLimit / 60);
        const secs = currentTimeLimit % 60;
        timeMinutesInput.value = mins;
        timeSecondsInput.value = secs;
    }
    if (maxQuestionsInput) maxQuestionsInput.value = currentMaxQuestions;
    // Spielerzeit pro Frage im Modal
    const playerTimeInput = document.getElementById('player-time');
    if (playerTimeInput) playerTimeInput.value = currentPlayerPerQuestion;

    if (modeIndicator) {
        modeIndicator.textContent = currentMode === "time"
            ? `Modus: Zeit (${formatTime(currentTimeLimit)})`
            : `Modus: Fragen (${currentMaxQuestions} pro Spieler)`;
    }

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

    // Lebende oben, Tote unten
    const aliveOrdered = order.filter(id => players[id] && players[id].lives > 0);
    const deadOrdered = order.filter(id => players[id] && players[id].lives <= 0);

    playerListDiv.innerHTML = '';

    const renderCard = (id) => {
        const p = players[id];
        if (!p) return;

        if (p.isDran) lastActiveId = id;
        const isDead = p.lives <= 0;
        const card = document.createElement('div');
        card.className = `p-4 rounded-2xl border transition-all select-none ${p.isDran ? 'border-red-600 bg-red-900/20 ring-2' : 'border-white/10 bg-white/5'} ${isDead ? 'opacity-60' : ''}`;
        card.draggable = !isDead;
        card.dataset.playerId = id;

        // Name verkleinern, wenn lang, damit Herzen+Stern in einer Zeile bleiben
        const nameSizeClass = p.name && p.name.length > 10 ? 'text-xs' : 'text-sm';

        // Admin-Ansicht: nur volle Herzen anzeigen (keine leeren Slots)
        const rawLives = typeof p.lives === 'number' ? p.lives : 0;
        const hearts = rawLives > 0 ? "❤️".repeat(rawLives) : "☠️";

        // Fragen-Anzeige (nur im Fragen-Modus)
        const qLeft = currentMode === "questions"
            ? (typeof p.questionsLeft === "number" ? p.questionsLeft : currentMaxQuestions)
            : null;

        const jokerStar = p.jokerUsed ? "☆" : "⭐";

        const correct = typeof p.roundCorrect === "number" ? p.roundCorrect : 0;
        const wrong = typeof p.roundWrong === "number" ? p.roundWrong : 0;

        card.innerHTML = `
            <div class="flex justify-between items-center mb-3">
                <div class="flex flex-col gap-0.5">
                    <span class="font-black uppercase text-white ${nameSizeClass}">${p.name}</span>
                    ${qLeft !== null ? `<span class="text-[9px] text-white/50 uppercase tracking-widest">Fragen: ${qLeft}</span>` : ''}
                    <span class="text-[9px] text-white/40 uppercase tracking-widest">Richtig: ${correct} · Falsch: ${wrong}</span>
                </div>
                <span class="text-red-500 font-bold flex items-center gap-0.5 whitespace-nowrap">${hearts} <span class="text-yellow-400/90">${jokerStar}</span></span>
            </div>
            <div class="grid grid-cols-2 gap-2">
                ${isDead
                    ? `<button onclick="window.revivePlayer('${id}')" class="col-span-2 bg-emerald-600 hover:bg-emerald-500 text-[9px] py-2 rounded font-bold text-white uppercase">Wiederbeleben</button>`
                    : `<button onclick="window.setDran('${id}')" class="bg-blue-600 text-[9px] py-2 rounded font-bold text-white uppercase italic">An die Reihe</button>
                       <button onclick="window.resetJoker('${id}')" class="bg-yellow-600 text-[9px] py-2 rounded font-bold text-black uppercase">Joker Reset</button>
                       <button onclick="window.changeLives('${id}', -1)" class="bg-red-600 py-1 rounded text-white text-[9px]">-1 HP</button>
                       <button onclick="window.changeLives('${id}', 1)" class="bg-green-600 py-1 rounded text-white text-[9px]">+1 HP</button>
                       <button onclick="window.kickPlayer('${id}')" class="col-span-2 bg-white/10 hover:bg-red-700 text-[9px] py-2 rounded font-bold text-red-400 uppercase border border-red-700/60 mt-1">Kick</button>`
                }
            </div>`;
        playerListDiv.appendChild(card);
    };

    // Zuerst alle lebenden Spieler, dann alle toten
    aliveOrdered.forEach(renderCard);
    deadOrdered.forEach(renderCard);

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
        const players = snap.val() || {};
        const updates = {};
        Object.keys(players).forEach(pId => {
            updates[`players/${pId}/isDran`] = (pId === id);
        });
        updates['gameState/playerTimer'] = currentPlayerPerQuestion;
        // Rundencounter beim Setzen des ersten Spielers (neue Runde) zurücksetzen
        Object.keys(players).forEach(pId => {
            updates[`players/${pId}/roundCorrect`] = 0;
            updates[`players/${pId}/roundWrong`] = 0;
        });
        update(ref(db), updates);
    }, { onlyOnce: true });
};

window.resetJoker = (id) => update(ref(db, `players/${id}`), { jokerUsed: false });
window.revivePlayer = (id) => update(ref(db, `players/${id}`), { lives: 3, jokerUsed: false });
window.kickPlayer = (id) => {
    onValue(ref(db), (snap) => {
        const data = snap.val() || {};
        const updates = {};

        // Spieler entfernen
        updates[`players/${id}`] = null;

        // Votes bereinigen
        const votes = data.votes || {};
        Object.keys(votes).forEach(voterId => {
            if (votes[voterId] === id) {
                updates[`votes/${voterId}`] = null;
            }
        });

        // Reihenfolge bereinigen
        const gs = data.gameState || {};
        if (Array.isArray(gs.playerOrder)) {
            const newOrder = gs.playerOrder.filter(pid => pid !== id);
            updates['gameState/playerOrder'] = newOrder;
        }

        update(ref(db), updates);
    }, { onlyOnce: true });
};
window.changeLives = (id, amount) => {
    onValue(ref(db, `players/${id}/lives`), (s) => {
        update(ref(db, `players/${id}`), { lives: Math.max(0, (s.val() || 0) + amount) });
    }, { onlyOnce: true });
};

// --- RUNDENMODUS & LIMITS (Modal) ---
const applySettingsToDb = () => {
    const mode = modeQuestionsRadio && modeQuestionsRadio.checked ? "questions" : "time";
    const minutes = parseInt(timeMinutesInput?.value ?? "", 10);
    const seconds = parseInt(timeSecondsInput?.value ?? "", 10);
    let timeLimit = 0;
    if (!isNaN(minutes)) timeLimit += minutes * 60;
    if (!isNaN(seconds)) timeLimit += seconds;
    if (timeLimit <= 0) timeLimit = currentTimeLimit || 150;
    const maxQ = parseInt(maxQuestionsInput?.value || currentMaxQuestions, 10) || 5;
    const playerTimeInput = document.getElementById('player-time');
    const playerTime = parseInt(playerTimeInput?.value || currentPlayerPerQuestion, 10) || 30;

    currentMode = mode;
    currentTimeLimit = timeLimit;
    currentMaxQuestions = maxQ;
    currentPlayerPerQuestion = playerTime;

    // Einstellungen speichern
    return update(ref(db, 'settings'), {
        mode,
        timeLimitSeconds: timeLimit,
        maxQuestions: maxQ,
        playerTimeSeconds: playerTime
    }).then(() => {
        // Beim Wechsel des Modus Runde sauber zurücksetzen,
        // damit alle Clients denselben Zustand haben
        const initialRoundTime = mode === "time" ? timeLimit : 0;
        return update(ref(db, 'gameState'), {
            active: false,
            isPaused: false,
            roundTimer: initialRoundTime,
            playerTimer: playerTime
        });
    });
};

if (openModeBtn && modeModal && modeCancelBtn && modeSaveBtn) {
    openModeBtn.onclick = () => {
        modeModal.classList.remove('hidden');
    };
    modeCancelBtn.onclick = () => {
        modeModal.classList.add('hidden');
    };
    modeSaveBtn.onclick = () => {
        applySettingsToDb().then(() => {
            modeModal.classList.add('hidden');
        });
    };
}

startRoundBtn.onclick = () => {
    stopVoteTimer();
    remove(ref(db, 'votes'));

    const initialRoundTime = currentMode === "time" ? currentTimeLimit : 0;

    update(ref(db, 'gameState'), {
        active: true,
        isPaused: false,
        roundTimer: initialRoundTime,
        playerTimer: currentPlayerPerQuestion,
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

        // Im Fragen-Modus: questionsLeft für alle lebenden Spieler setzen
        if (currentMode === "questions") {
            const updates = {};
            ids.forEach(id => {
                if ((p[id].lives || 0) > 0) {
                    updates[`players/${id}/questionsLeft`] = currentMaxQuestions;
                    updates[`players/${id}/chatDisabled`] = false;
                }
            });
            if (Object.keys(updates).length) update(ref(db), updates);
        }
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
    update(ref(db, 'gameState'), { active: false, isPaused: false, roundTimer: 150, playerTimer: currentPlayerPerQuestion });
    currentRoundTime = 150;
    currentPlayerTime = currentPlayerPerQuestion;
};

// --- RICHTIG / FALSCH & NÄCHSTER SPIELER ---
function goToNextPlayer({ penalizeCurrent = false, flash = null, isCorrect = null } = {}) {
    onValue(ref(db), (snap) => {
        const data = snap.val() || {};
        const players = data.players || {};
        const settings = data.settings || {};
        const mode = settings.mode || currentMode;
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

        // Im Fragen-Modus: aktuelle Frage des aktiven Spielers verbrauchen
        if (mode === "questions" && currentId && players[currentId]) {
            const currentQ = typeof players[currentId].questionsLeft === "number"
                ? players[currentId].questionsLeft
                : (settings.maxQuestions || currentMaxQuestions || 0);
            const nextQ = Math.max(0, currentQ - 1);
            updates[`players/${currentId}/questionsLeft`] = nextQ;
            if (nextQ === 0) {
                updates[`players/${currentId}/chatDisabled`] = true;
            }
        }

        // Rundencounter (richtig/falsch) aktualisieren
        if (currentId && players[currentId]) {
            const cur = players[currentId];
            const baseCorrect = typeof cur.roundCorrect === "number" ? cur.roundCorrect : 0;
            const baseWrong = typeof cur.roundWrong === "number" ? cur.roundWrong : 0;
            if (isCorrect === true) {
                updates[`players/${currentId}/roundCorrect`] = baseCorrect + 1;
            } else if (isCorrect === false) {
                updates[`players/${currentId}/roundWrong`] = baseWrong + 1;
            }
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
        updates['gameState/playerTimer'] = currentPlayerPerQuestion;
        if (flash) {
            updates['gameState/flashEffect'] = flash;
        }

        update(ref(db), updates).then(() => {
            if (flash) {
                setTimeout(() => {
                    update(ref(db, 'gameState'), { flashEffect: null });
                }, 1200);
            }
            // Nach erfolgreichem Spielerwechsel neue Frage anzeigen
            showNextQuestion();
        });
    }, { onlyOnce: true });
}

window.answerAndNext = (isCorrect) => {
    // Bei Falsch wird KEIN Herz abgezogen – nur im Voting verliert man ein Leben
    goToNextPlayer({ penalizeCurrent: false, flash: isCorrect ? 'correct' : 'wrong', isCorrect });
};

window.skipPlayer = () => {
    goToNextPlayer({ penalizeCurrent: false, flash: null });
};

nextPlayerBtn.onclick = () => window.skipPlayer();

// --- VOTING-KONTROLLE ---
startVoteBtn.onclick = () => {
    stopVoteTimer();
    // Erst Votes wirklich löschen, DANN Voting-Status setzen, um Race Conditions zu vermeiden
    remove(ref(db, 'votes')).then(() => {
        currentVoteTime = 60;
        update(ref(db, 'gameState'), {
            votingActive: true,
            votingFinished: false,
            showResults: false,
            votingTie: false,
            voteTimer: currentVoteTime
        });
        startVoteTimer();
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
            // Klarer Verlierer: 1 Leben abziehen und Ergebnisse anzeigen
            const loserId = losers[0];
            const newLives = Math.max(0, (players[loserId].lives || 0) - 1);
            update(ref(db, `players/${loserId}`), { lives: newLives });
            stopVoteTimer();
            update(ref(db, 'gameState'), {
                votingTie: false,
                votingActive: false,
                votingFinished: false,
                showResults: true,
                voteTimer: 0
            });
        } else {
            // Stechen: NUR Ergebnisse mit „STECHEN – Neuwählen“ anzeigen, KEIN neues Voting
            stopVoteTimer();
            update(ref(db, 'gameState'), {
                votingTie: true,
                votingActive: false,
                votingFinished: false,
                showResults: true,
                voteTimer: 0
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
        set(ref(db, 'settings'), {
            mode: "time",
            timeLimitSeconds: 150,
            maxQuestions: 5,
            playerTimeSeconds: 30
        }),
        set(ref(db, 'gameState'), {
            active: false,
            isPaused: false,
            roundTimer: 150,
            playerTimer: currentPlayerPerQuestion,
            flashEffect: null,
            votingActive: false,
            votingFinished: false,
            showResults: false,
            votingTie: false,
            voteTimer: 60
        })
    ]);
};
