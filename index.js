const {Client, GatewayIntentBits, Events, ActionRowBuilder, ButtonBuilder, ButtonStyle} = require('discord.js')
const ai = require('tictactoe-complex-ai')
const crypto = require('crypto')

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
})

client.login().catch((e) => {
    console.error("The bot token was incorrect.\n" + e)
})

const prefix = "!ttt"

const P1 = 1, P2 = 2
const columnMap = new Map([
    ["c1", 0], ["c2", 1], ["c3", 2],
    ["c4", 3], ["c5", 4], ["c6", 5],
    ["c7", 6], ["c8", 7], ["c9", 8]
])
const aiInstance = ai.createAI({
    level: 'expert',
    empty: " ",
    minResponseTime: 200,
    maxResponseTime: 8000
})

// map structure is like this
// [gameId => [uid => string, board => [], turn => "", players => [], isAi => false]]
const games = new Map()

client.on(Events.InteractionCreate, async i => {
    if (!i.isButton()) return

    const game = games.get(i.message.id)

    if (!game) {
        i.reply({content: 'This game is already over!', ephemeral: true})
        return
    }

    if (!game.get('players').get(i.user.id)) {
        i.reply({content: 'You\'re not participated in this game!', ephemeral: true})
        return
    }

    if (i.user.id !== game.get('players').get(game.get('turn'))) {
        i.reply({content: 'You haven\'t turned yet!', ephemeral: true})
        return
    }

    clearTimeout(game.get('timeoutId'))
    game.set('timeoutId', setTimeout(() => {
        cleanGame(messageId)
    }, 60000))

    game.get('board').set(columnMap.get(i.customId.replaceAll(game.get('uid') + "-", "")), game.get('turn') === P1 ? "X" : "O")
    game.set('turn', game.get('turn') === P1 ? P2 : P1)

    const turnText = game.get('turn') === P1 ? ":regional_indicator_x: **" + (await client.users.fetch(game.get('players').get(P1))).username + " turn**" : ":regional_indicator_o: **" + (await client.users.fetch(game.get('players').get(P2))).username + " turn**"

    // calculate winner on first move
    let winner = calculateWinner(Array.from(game.get('board').values()))
    if (winner !== " ") {
        const userId = game.get('players').get(winner === "X" ? P1 : P2)
        const user = await client.users.fetch(userId)

        await i.update({
            content: i.message.content.replaceAll(i.message.content.split("\n")[1], "").replaceAll(i.message.content.split("\n")[2], "").replaceAll("\n", "") + "\n:trophy: **" + user.username + " won!**",
            components: updateBoard(game.get('board'), game.get('uid')),
            allowedMentions: {repliedUser: false}
        })

        cleanGame(i.message.id)
        return;
    }
    if (!Array.from(game.get('board').values()).includes(" ")) {
        await i.update({
            content: i.message.content.replaceAll(i.message.content.split("\n")[1], "").replaceAll(i.message.content.split("\n")[2], "").replaceAll("\n", "") + "\n:thread: **Game Tie!**",
            components: updateBoard(game.get('board'), game.get('uid')),
            allowedMentions: {repliedUser: false}
        })
        cleanGame(i.message.id)
        return
    }

    if (game.get('isAi')) {
        i.update({
            content: i.message.content + (game.get('isAi') ? "\n<a:loading:1032708714605592596> **AI is thinking...**" : ""),
            components: updateBoard(game.get('board'), game.get('uid')),
            allowedMentions: {repliedUser: false}
        })
    } else {
        i.update({
            content: i.message.content.replaceAll(i.message.content.split("\n")[1], turnText) + (game.get('isAi') ? "\n<a:loading:1032708714605592596> **AI is thinking...**" : ""),
            components: updateBoard(game.get('board'), game.get('uid')),
            allowedMentions: {repliedUser: false}
        })
    }

    if (game.get('isAi')) {
        clearTimeout(game.get('timeoutId'))
        game.set('timeoutId', setTimeout(() => {
            cleanGame(messageId)
        }, 60000))

        try {
            const pos = await aiInstance.play(Array.from(game.get('board').values()))

            game.get('board').set(pos, game.get('turn') === P1 ? "X" : "O")

            await i.message.edit({
                content: i.message.content.replaceAll("\n<a:loading:1032708714605592596> **AI is thinking...**", ""),
                components: updateBoard(game.get('board'), game.get('uid')),
                allowedMentions: {repliedUser: false}
            })

            game.set('turn', game.get('turn') === P1 ? P2 : P1)
        } catch (e) {
            await i.message.edit({
                content: i.message.content.replaceAll("\n<a:loading:1032708714605592596> **AI is thinking...**", ""),
                components: updateBoard(game.get('board'), game.get('uid')),
                allowedMentions: {repliedUser: false}
            })
        }
    }

    // calculate winner on second move
    winner = calculateWinner(Array.from(game.get('board').values()))
    if (winner !== " ") {
        const userId = game.get('players').get(winner === "X" ? P1 : P2)
        const user = await client.users.fetch(userId)

        await i.message.edit({
            content: i.message.content.replaceAll(i.message.content.split("\n")[1], "").replaceAll(i.message.content.split("\n")[2], "").replaceAll("\n", "") + "\n:trophy: **" + user.username + " won!**",
            components: updateBoard(game.get('board'), game.get('uid')),
            allowedMentions: {repliedUser: false}
        })

        cleanGame(i.message.id)
        return;
    }
    if (!Array.from(game.get('board').values()).includes(" ")) {
        await i.message.edit({
            content: i.message.content.replaceAll(i.message.content.split("\n")[1], "").replaceAll(i.message.content.split("\n")[2], "").replaceAll("\n", "") + "\n:thread: **Game Tie!**",
            components: updateBoard(game.get('board'), game.get('uid')),
            allowedMentions: {repliedUser: false}
        })
        cleanGame(i.message.id)
    }
})

client.on(Events.MessageCreate, async msg => {
    if (msg.author.bot) return

    if (msg.content.startsWith(prefix)) {
        const user = msg.mentions.users.first()

        if (!user || (user.id === client.user.id)) {
            const message = await msg.reply({
                content: "<a:loading:1032708714605592596> **Creating a game for you...**",
                allowedMentions: {repliedUser: false}
            })
            const gameMap = createGame(message.id, msg.author.id, client.user.id, true)
            games.set(message.id, gameMap)

            await message.edit({
                content: msg.author.username + " playing TicTacToe with " + client.user.username + " (AI)\n:alarm_clock: **Game expires in 1 minute if none interacted**",
                components: drawBoard(gameMap.get("board"), gameMap.get("uid")),
                allowedMentions: {repliedUser: false}
            })

            await message.edit({
                content: msg.author.username + " playing TicTacToe with " + client.user.username + " (AI)\n:alarm_clock: **Game expires in 1 minute if none interacted**",
                components: drawBoard(gameMap.get("board"), gameMap.get("uid"), 0),
                allowedMentions: {repliedUser: false}
            })

            setTimeout(async () => {
                await message.edit({
                    content: msg.author.username + " playing TicTacToe with " + client.user.username + " (AI)\n:alarm_clock: **Game expires in 1 minute if none interacted**",
                    components: drawBoard(gameMap.get("board"), gameMap.get("uid")),
                    allowedMentions: {repliedUser: false}
                })
            }, 50)

            return
        }

        const message = await msg.reply({
            content: "<a:loading:1032708714605592596> **Creating a game for you...**",
            allowedMentions: {repliedUser: false}
        })
        const gameMap = createGame(message.id, msg.author.id, user.id, false)
        games.set(message.id, gameMap)

        await message.edit({
            content: msg.author.username + " playing TicTacToe with " + user.username + "\n:regional_indicator_x: **" + msg.author.username + " turn!**\n:alarm_clock: **Game expires in 1 minute if none interacted**",
            components: drawBoard(gameMap.get("board"), gameMap.get("uid")),
            allowedMentions: {repliedUser: false}
        })

        await message.edit({
            content: msg.author.username + " playing TicTacToe with " + user.username + "\n:regional_indicator_x: **" + msg.author.username + " turn!**\n:alarm_clock: **Game expires in 1 minute if none interacted**",
            components: drawBoard(gameMap.get("board"), gameMap.get("uid"), 0),
            allowedMentions: {repliedUser: false}
        })

        setTimeout(async () => {
            await message.edit({
                content: msg.author.username + " playing TicTacToe with " + user.username + "\n:regional_indicator_x: **" + msg.author.username + " turn!**\n:alarm_clock: **Game expires in 1 minute if none interacted**",
                components: drawBoard(gameMap.get("board"), gameMap.get("uid")),
                allowedMentions: {repliedUser: false}
            })
        }, 50)
    }
})

function createGame(messageId, player1, player2, isAi) {
    const uid = generateUID(10)
    const boardMap = new Map()

    const gameMap = new Map()
    gameMap
        .set('uid', uid)
        .set('board', boardMap)
        .set('turn', P1)
        .set('players', new Map()
            .set(P1, player1).set(player1, P1)
            .set(P2, player2).set(player2, P2))
        .set('isAi', isAi)
        .set('timeoutId', setTimeout(() => {
            cleanGame(messageId)
        }, 60000))

    return gameMap
}

function calculateWinner(squares) {
    const winningConditions = [
        [0, 1, 2],
        [3, 4, 5],
        [6, 7, 8],

        [0, 3, 6],
        [1, 4, 7],
        [2, 5, 8],

        [0, 4, 8],
        [2, 4, 6]
    ]

    for (let i = 0; i < winningConditions.length; i++) {
        const [a, b, c] = winningConditions[i]
        if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
            if (squares[a] !== "⠀") {
                return squares[a]
            }
        }
    }

    return " ";
}

function drawBoard(boardMap, uid, index = 1) {
    // first row
    let rowMap = new Map()
    for (let i = 0; i < 3; i++) {
        boardMap.set(i, " ")

        if (index === 0) {
            rowMap.set("c" + (i + 1), new ButtonBuilder().setCustomId(uid + "-c" + (i + 1))
                .setLabel((i + 1).toString()).setStyle(ButtonStyle.Success))
        } else {
            rowMap.set("c" + (i + 1), new ButtonBuilder().setCustomId(uid + "-c" + (i + 1))
                .setLabel((i + 1).toString()).setStyle(ButtonStyle.Secondary))
        }
    }
    const row1 = new ActionRowBuilder().addComponents(Array.from(rowMap.values()))

    // second row
    rowMap = new Map()
    for (let i = 3; i < 6; i++) {
        boardMap.set(i, " ")
        if (index === 0) {
            rowMap.set("c" + (i + 1), new ButtonBuilder().setCustomId(uid + "-c" + (i + 1))
                .setLabel((i + 1).toString()).setStyle(ButtonStyle.Success))
        } else {
            rowMap.set("c" + (i + 1), new ButtonBuilder().setCustomId(uid + "-c" + (i + 1))
                .setLabel((i + 1).toString()).setStyle(ButtonStyle.Secondary))
        }
    }
    const row2 = new ActionRowBuilder().addComponents(Array.from(rowMap.values()))

    // third row
    rowMap = new Map()
    for (let i = 6; i < 9; i++) {
        boardMap.set(i, " ")
        if (index === 0) {
            rowMap.set("c" + (i + 1), new ButtonBuilder().setCustomId(uid + "-c" + (i + 1))
                .setLabel((i + 1).toString()).setStyle(ButtonStyle.Success))
        } else {
            rowMap.set("c" + (i + 1), new ButtonBuilder().setCustomId(uid + "-c" + (i + 1))
                .setLabel((i + 1).toString()).setStyle(ButtonStyle.Secondary))
        }
    }
    const row3 = new ActionRowBuilder().addComponents(Array.from(rowMap.values()))

    return [row1, row2, row3]
}

function updateBoard(boardMap, uid) {
    // first row
    let rowMap = new Map()
    for (let i = 0; i < 3; i++) {
        const buttonBuilder = new ButtonBuilder().setCustomId(uid + "-c" + (i + 1)).setLabel(boardMap.get(i))

        switch (boardMap.get(i)) {
            case "X":
                rowMap.set("c" + (i + 1), buttonBuilder.setStyle(ButtonStyle.Danger).setDisabled(true))
                break
            case "O":
                rowMap.set("c" + (i + 1), buttonBuilder.setStyle(ButtonStyle.Primary).setDisabled(true))
                break
            default:
                rowMap.set("c" + (i + 1), buttonBuilder.setStyle(ButtonStyle.Secondary))
        }
    }
    const row1 = new ActionRowBuilder().addComponents(Array.from(rowMap.values()))

    // second row
    rowMap = new Map()
    for (let i = 3; i < 6; i++) {
        const buttonBuilder = new ButtonBuilder().setCustomId(uid + "-c" + (i + 1)).setLabel(boardMap.get(i))

        switch (boardMap.get(i)) {
            case "X":
                rowMap.set("c" + (i + 1), buttonBuilder.setStyle(ButtonStyle.Danger).setDisabled(true))
                break
            case "O":
                rowMap.set("c" + (i + 1), buttonBuilder.setStyle(ButtonStyle.Primary).setDisabled(true))
                break
            default:
                rowMap.set("c" + (i + 1), buttonBuilder.setStyle(ButtonStyle.Secondary))
        }
    }
    const row2 = new ActionRowBuilder().addComponents(Array.from(rowMap.values()))

    // third row
    rowMap = new Map()
    for (let i = 6; i < 9; i++) {
        const buttonBuilder = new ButtonBuilder().setCustomId(uid + "-c" + (i + 1)).setLabel(boardMap.get(i))

        switch (boardMap.get(i)) {
            case "X":
                rowMap.set("c" + (i + 1), buttonBuilder.setStyle(ButtonStyle.Danger).setDisabled(true))
                break
            case "O":
                rowMap.set("c" + (i + 1), buttonBuilder.setStyle(ButtonStyle.Primary).setDisabled(true))
                break
            default:
                rowMap.set("c" + (i + 1), buttonBuilder.setStyle(ButtonStyle.Secondary))
        }
    }
    const row3 = new ActionRowBuilder().addComponents(Array.from(rowMap.values()))

    return [row1, row2, row3]
}

function cleanGame(gameId) {
    clearTimeout(games.get(gameId).get('timeoutId'))
    games.delete(gameId)
}

function generateUID(length) {
    return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(length * 2)))).replace(/[+/]/g, "").substring(0, length);
}