const socket = io();

let meuId = null;
let meuNome = "";
let salaId = "";
let jogadores = [];
let pontos = {};
let minhaEscolha = null;

const mapaEmojis = { pedra: "✊", papel: "✋", tesoura: "✌️" };

const telas = {
  join: document.getElementById("screen-join"),
  waiting: document.getElementById("screen-waiting"),
  game: document.getElementById("screen-game"),
  gameover: document.getElementById("screen-gameover"),
};

function mostrarTela(nome) {
  Object.values(telas).forEach((t) => t.classList.remove("active"));
  telas[nome].classList.add("active");
}

let toastEl = null;
function mostrarToast(msg) {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "toast";
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.remove("show"), 2800);
}

document.getElementById("btn-join").addEventListener("click", () => {
  const nome = document.getElementById("playerName").value.trim();
  const sala = document.getElementById("roomId").value.trim();
  const errEl = document.getElementById("join-error");

  if (!nome) { errEl.textContent = "Digite seu nome!"; return; }
  if (!sala) { errEl.textContent = "Digite o código da sala!"; return; }

  errEl.textContent = "";
  meuNome = nome;
  salaId = sala;
  socket.emit("acessa_sala", { salaId: sala, nomeJogador: nome });
});

["playerName", "roomId"].forEach((id) => {
  document.getElementById(id).addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("btn-join").click();
  });
});

socket.on("connect", () => {
  meuId = socket.id;
});

socket.on("error", ({ message }) => {
  document.getElementById("join-error").textContent = message;
  mostrarTela("join");
});

socket.on("esperando", () => {
  document.getElementById("waiting-room-info").textContent = `Sala: ${salaId}`;
  document.getElementById("room-code-display").textContent = salaId;
  mostrarTela("waiting");
});

socket.on("atualiza_sala", (dados) => {
  jogadores = dados.jogador;
  pontos = dados.pontos;
});

socket.on("jogo_comecou", ({ jogadores: jogs, round, maxRounds }) => {
  jogadores = jogs;
  minhaEscolha = null;

  configurarInterfaceJogo(jogs, {}, round, maxRounds);
  resetarBotoesEscolha();
  document.getElementById("game-status").textContent = "⚡ Jogo começou! Faça sua escolha!";
  document.getElementById("choices-display").style.display = "none";
  document.getElementById("choices-grid").style.display = "grid";

  mostrarTela("game");
  mostrarToast("Jogo iniciado! Boa sorte! 🎮");
});

socket.on("escolha_jogador", ({ jogadorId, nomeJogador }) => {
  const souEu = jogadorId === meuId;
  const j1 = jogadores[0];

  if (souEu) {
    const indicador = j1.id === meuId ? "indicator-p1" : "indicator-p2";
    document.getElementById(indicador).classList.add("ready");
    document.getElementById("game-status").textContent = "✅ Escolha feita! Aguardando oponente...";
  } else {
    const indicador = j1.id === jogadorId ? "indicator-p1" : "indicator-p2";
    document.getElementById(indicador).classList.add("ready");
    document.getElementById("game-status").textContent = `⏳ ${nomeJogador} já escolheu! Sua vez...`;
  }
});

socket.on("sala_resultado", ({ escolhas, vencedor, message, pontos: pts, round, jogadores: jogs }) => {
  pontos = pts;
  jogadores = jogs;

  const j1 = jogs[0], j2 = jogs[1];
  const e1 = escolhas[j1.id], e2 = escolhas[j2.id];

  document.getElementById("icon-p1").textContent = mapaEmojis[e1] || "?";
  document.getElementById("label-p1").textContent = j1.nome;
  document.getElementById("icon-p2").textContent = mapaEmojis[e2] || "?";
  document.getElementById("label-p2").textContent = j2.nome;

  document.getElementById("icon-p1").className = "choice-icon";
  document.getElementById("icon-p2").className = "choice-icon";
  if (vencedor) {
    const iconeGanhador = vencedor === j1.id ? "icon-p1" : "icon-p2";
    const iconePerdedor = vencedor === j1.id ? "icon-p2" : "icon-p1";
    document.getElementById(iconeGanhador).classList.add("winner-icon");
    document.getElementById(iconePerdedor).classList.add("loser-icon");
  }

  document.getElementById("choices-grid").style.display = "none";
  document.getElementById("choices-display").style.display = "flex";

  atualizarPlacarInterface(jogs, pts);
  document.getElementById("game-status").textContent = message;
  minhaEscolha = null;
});

socket.on("proximo_round", ({ round, pontos: pts }) => {
  pontos = pts;
  atualizarPlacarInterface(jogadores, pts);
  atualizarRodadaInterface(round);
  resetarBotoesEscolha();
  document.getElementById("game-status").textContent = `Rodada ${round} — Faça sua escolha!`;
  document.getElementById("choices-display").style.display = "none";
  document.getElementById("choices-grid").style.display = "grid";
  limparIndicadores();
});

socket.on("fim_jogo", ({ vencedorId, pontos: pts, jogadores: jogs, empate }) => {
  pontos = pts;

  const icone = document.getElementById("gameover-icon");
  const titulo = document.getElementById("gameover-title");
  const msg = document.getElementById("gameover-msg");
  const divPlacares = document.getElementById("final-scores");

  if (empate) {
    icone.textContent = "🤝";
    titulo.textContent = "Empate!";
    msg.textContent = "Vocês estão no mesmo nível!";
  } else if (vencedorId && vencedorId === meuId) {
    icone.textContent = "🏆";
    titulo.textContent = "Você Venceu!";
    msg.textContent = "Parabéns, campeão!";
  } else {
    icone.textContent = "😢";
    titulo.textContent = "Você Perdeu!";
    const oponente = jogs.find(j => j.id !== meuId);
    msg.textContent = `${oponente ? oponente.nome : "Oponente"} foi melhor desta vez.`;
  }

  divPlacares.innerHTML = "";
  const pontuacaoVencedor = vencedorId ? pts[vencedorId] : 0;
  jogs.forEach((j) => {
    const totalPontos = pts[j.id] || 0;
    let classe = empate ? "draw" : totalPontos === pontuacaoVencedor ? "win" : "lose";
    divPlacares.innerHTML += `
      <div class="final-score-item">
        <span class="final-score-name">${j.nome}</span>
        <span class="final-score-val ${classe}">${totalPontos}</span>
      </div>`;
  });

  mostrarTela("gameover");
});

socket.on("jogo_reiniciado", ({ jogadores: jogs, round, maxRounds, pontos: pts }) => {
  jogadores = jogs;
  pontos = pts;
  minhaEscolha = null;

  configurarInterfaceJogo(jogs, pts, round, maxRounds);
  resetarBotoesEscolha();
  document.getElementById("choices-display").style.display = "none";
  document.getElementById("choices-grid").style.display = "grid";
  document.getElementById("game-status").textContent = "Nova partida! Faça sua escolha!";
  limparIndicadores();

  mostrarTela("game");
  mostrarToast("Partida reiniciada! 🔄");
});

socket.on("jogador_saiu", ({ nomeJogador }) => {
  mostrarToast(`${nomeJogador || 'Oponente'} saiu da sala 😔`);
  document.getElementById("waiting-room-info").textContent = `Sala: ${salaId}`;
  document.getElementById("room-code-display").textContent = salaId;
  mostrarTela("waiting");
});

document.querySelectorAll(".choice-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (minhaEscolha) return;
    const escolha = btn.dataset.choice;
    minhaEscolha = escolha;

    document.querySelectorAll(".choice-btn").forEach((b) => {
      b.classList.toggle("selected", b.dataset.choice === escolha);
      b.disabled = true;
    });

    socket.emit("faca_escolha", { escolha });
  });
});

document.getElementById("btn-restart").addEventListener("click", () => {
  socket.emit("reiniciar_jogo");
});

document.getElementById("btn-back").addEventListener("click", () => {
  location.reload();
});

function configurarInterfaceJogo(jogs, pts, round, maxRounds) {
  document.getElementById("name-p1").textContent = jogs[0]?.nome || "P1";
  document.getElementById("name-p2").textContent = jogs[1]?.nome || "P2";
  document.getElementById("pts-p1").textContent = pts[jogs[0]?.id] || 0;
  document.getElementById("pts-p2").textContent = pts[jogs[1]?.id] || 0;
  atualizarRodadaInterface(round, maxRounds);
  limparIndicadores();
}

function atualizarPlacarInterface(jogs, pts) {
  const v1 = pts[jogs[0]?.id] || 0;
  const v2 = pts[jogs[1]?.id] || 0;
  document.getElementById("pts-p1").textContent = v1;
  document.getElementById("pts-p2").textContent = v2;

  const c1 = document.getElementById("score-p1");
  const c2 = document.getElementById("score-p2");
  c1.classList.toggle("leading", v1 > v2);
  c1.classList.toggle("trailing", v1 < v2);
  c2.classList.toggle("leading", v2 > v1);
  c2.classList.toggle("trailing", v2 < v1);
}

function atualizarRodadaInterface(round, maxRounds) {
  if (maxRounds !== undefined) {
    document.getElementById("round-number").textContent = `${round} / ${maxRounds}`;
  } else {
    const atual = document.getElementById("round-number").textContent;
    const max = atual.split("/")[1]?.trim() || "3";
    document.getElementById("round-number").textContent = `${round} / ${max}`;
  }
}

function resetarBotoesEscolha() {
  minhaEscolha = null;
  document.querySelectorAll(".choice-btn").forEach((b) => {
    b.disabled = false;
    b.classList.remove("selected");
  });
}

function limparIndicadores() {
  document.getElementById("indicator-p1").classList.remove("ready");
  document.getElementById("indicator-p2").classList.remove("ready");
  document.getElementById("indicator-text").textContent = "Aguardando escolhas...";
}