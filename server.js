const express = require('express');
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname,"public")));

const salas = {}

function createSalas(salaId){
    return{
        id: salaId,
        jogadores: [],
        escolhas: {},
        pontos: {},
        round: 0,
        maxRounds: 3,
        status: "esperando",
    };
}

function getGanha(escolha1, escolha2){
    if(escolha1 === escolha2) return "empate";
    const ganhador = {
        pedra: "tesoura",
        papel: "pedra",
        tesoura: "papel"
    } ;
    return ganhador[escolha1] === escolha2 ? "jogador1" : "jogador2";
}

function getRoundResult(sala){
    const [j1, j2] = sala.jogadores;
    const e1 = sala.escolhas[j1.id];
    const e2 = sala.escolhas[j2.id];
    const ganhador = getGanha(e1, e2);

    const numeroRodadas = sala.round + 1;

    if(ganhador === "empate"){
        return { ganhador: null, message: `Empatou na ${numeroRodadas} rodada !`};
    }

    const ganhadorId = ganhador === "jogador1" ? j1.id : j2.id;
    const ganhadorNome = ganhador === "jogador1" ? j1.nome : j2.nome;
    sala.pontos[ganhadorId] = (sala.pontos[ganhadorId] || 0) + 1;

    return { ganhador: ganhadorId, message: `${ganhadorNome} vencer a ${numeroRodadas} rodada !`};
}

io.on("connection", (socket) => {
    console.log(`Jogador conectado: ${socket.id}`);
    
    socket.on("acessa_sala", ({salaId, nomeJogador}) =>{
        let sala = salas[salaId];

        if(!sala){
            sala = createSalas(salaId);
            salas[salaId] = sala;
        }

        if(sala.jogadores.length >= 2){
            socket.emit("error", {message: "Sala Cheia! Tente outra."});
            return;
        }

        if(sala.status === "finalizado"){
            socket.emit("error", {message: "A partida chegou ao Fim."});
            return;
        }
        
        const jogador = {id: socket.id, nome: nomeJogador};
        sala.jogadores.push(jogador);
        sala.pontos[socket.id] = 0;
        socket.join(salaId);
        socket.data.salaId = salaId;
        socket.data.nome = nomeJogador;

        console.log(`${nomeJogador} entrou na sala ${salaId}`);

        io.to(salaId).emit("atualiza_sala", {
            jogador: sala.jogadores,
            pontos: sala.pontos,
            round: sala.round,
            maxRounds: sala.maxRounds,
            status: sala.status,
        });

        if(sala.jogadores.length === 2){
            sala.status = "jogando";
            sala.round = 1;
            io.to(salaId).emit("jogo_comecou", {
                jogadores: sala.jogadores,
                round: sala.round,
                maxRounds: sala.maxRounds,
            });
        }else{
            socket.emit("esperando", {message: "Aguardando outro jogador..."});
        }
    });

    socket.on("faca_escolha", ({escolha}) =>{
        const salaId = socket.data.salaId;
        const sala = salas[salaId];

        if(!sala || sala.status !== "jogando") return;
        if(sala.escolhas[socket.id] ) return;

        const escolhaValida = ["pedra", "papel", "tesoura"];
        if(!escolhaValida.includes(escolha)) return;

        sala.escolhas[socket.id] = escolha;
        console.log(`${socket.data.nome} escolher ${escolha}`);

        io.to(salaId).emit("escolha_jogador",{
            jogadorId: socket.id,
            nomeJogador: socket.data.nome,
        });

        if (Object.keys(sala.escolhas).length === 2){
            sala.status = "resultado";

            const result = getRoundResult(sala);

            setTimeout(() => {
                io.to(salaId).emit("sala_resultado",{
                    escolhas: sala.escolhas,
                    vencedor: result.ganhador,
                    message: result.message,
                    pontos: sala.pontos,
                    round: sala.round,
                    jogadores: sala.jogadores,
                });
            

                const maxPontos = Math.max(...Object.values(sala.pontos));
                const pontosNecessarios = Math.ceil(sala.maxPontos / 2);

                const maxPontos = Math.max(...Object.values(sala.pontos));
                const pontosNecessarios = Math.ceil(sala.maxRounds / 2);

                if (maxPontos >= pontosNecessarios || sala.round >= sala.maxRounds) {

                    setTimeout(() => {

                        sala.status = "finalizado";

                        const isEmpate = Object.values(sala.pontos).every(
                            (p) => p === Object.values(sala.pontos)[0]
                        );

                        let vencedorFinalId = null;

                        if (!isEmpate) {
                            vencedorFinalId = Object.entries(sala.pontos)
                                .sort((a, b) => b[1] - a[1])[0][0];
                        }

                        io.to(salaId).emit("fim_jogo", {
                            vencedorId: vencedorFinalId,
                            pontos: sala.pontos,
                            jogadores: sala.jogadores,
                            empate: isEmpate
                        });

                    }, 2500);
                } else{
                    setTimeout(() => {
                        sala.round++;
                        sala.escolhas = {};
                        sala.status = "jogando";
                        io.to(salaId).emit("proxima_round",{
                           round: sala.round,
                           pontos: sala.pontos,     
                        });
                    }, 2500);
                }
            },500);
        }
    });
    socket.on("reiniciar_jogo", () => {
        const salaId = socket.data.salaId;
        const sala = salas[salaId];

        if(!sala) return;
        if(sala.jogadores.length < 2) return;

        sala.escolhas = {};
        sala.round = 1;
        sala.status = "jogando";
        Object.keys(sala.pontos).forEach((id) => (sala.pontos[id] = 0));

        io.to(salaId).emit("joga_reiniciado", {
            jogadores: sala.jogadores,
            round: sala.round,
            maxRounds: sala.maxRounds,
            pontos: sala.pontos,
        });
    });

    socket.on("disconnect", () => {
        const salaId = socket.data.salaId;
        if(!salaId) return;

        const sala = salas[salaId];

        if(!sala) return;

        sala.jogadores = sala.jogadores.filter((j) => j.id !== socket.id);
        delete sala.escolhas[socket.id];

        console.log(`${socket.data.nome} saiu da sala ${salaId}`);

        if (sala.jogadores.length === 0){
            delete salas[salaId];
        }else{
            sala.status = "esperando";
            io.to(salaId).emit("jogador_saiu",{
                nomeJogador: socket.data.nome,
                jogadores: sala.jogadores,
            });
        }
    })
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`JOKENPO GAME rodando em http://localhost:${PORT}`);
});