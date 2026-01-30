const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const config = require('./config.json');
const path = require('path');
require('dotenv').config();

class MusicBot {
    constructor(botConfig) {
        this.config = botConfig;
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent
            ]
        });

        this.player = createAudioPlayer();
        this.connection = null;

        this.setupEvents();
    }

    setupEvents() {
        this.client.once('ready', async () => {
            console.log(`[${this.config.name}] Logged in as ${this.client.user.tag}`);
            await this.autoJoin();
        });

        this.client.on('messageCreate', async (message) => {
            if (message.author.bot || !message.content.startsWith(config.prefix)) return;

            const args = message.content.slice(config.prefix.length).trim().split(/ +/);
            const command = args.shift().toLowerCase();

            if (command === 'join') {
                const channel = message.member.voice.channel;
                if (channel) {
                    this.joinChannel(channel.id, channel.guild.id, channel.guild.voiceAdapterCreator);
                    message.reply(`✅ Joined **${channel.name}**`);
                } else {
                    message.reply('❌ You need to be in a voice channel!');
                }
            }

            if (command === 'leave') {
                if (this.connection) {
                    this.connection.destroy();
                    this.connection = null;
                    message.reply('👋 Left the voice channel.');
                }
            }

            if (command === 'status') {
                message.reply(`🤖 **${this.config.name}** is online and ready!`);
            }
        });

        this.player.on('error', error => {
            console.error(`[${this.config.name}] Player Error: ${error.message}`);
        });
    }

    async autoJoin() {
        if (this.config.channelId && this.config.channelId.length > 10) {
            try {
                const channel = await this.client.channels.fetch(this.config.channelId);
                if (channel && channel.isVoiceBased()) {
                    this.joinChannel(channel.id, channel.guild.id, channel.guild.voiceAdapterCreator);
                    console.log(`[${this.config.name}] Auto-joined channel: ${channel.name}`);
                }
            } catch (err) {
                console.error(`[${this.config.name}] Could not auto-join channel ${this.config.channelId}: ${err.message}`);
            }
        }
    }

    joinChannel(channelId, guildId, adapterCreator) {
        this.connection = joinVoiceChannel({
            channelId: channelId,
            guildId: guildId,
            adapterCreator: adapterCreator,
            selfDeaf: true
        });

        this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000),
                ]);
            } catch (error) {
                this.connection.destroy();
                this.connection = null;
            }
        });

        this.connection.subscribe(this.player);
    }

    login() {
        const token = process.env[`TOKEN_${config.bots.indexOf(this.config) + 1}`] || this.config.token;
        if (token && token !== "TOKEN_X" && token.length > 10) {
            this.client.login(token).catch(err => {
                console.error(`[${this.config.name}] Login Failed: ${err.message}`);
            });
        } else {
            console.warn(`[${this.config.name}] No valid token provided.`);
        }
    }
}

// Start all bots
config.bots.forEach(botData => {
    const bot = new MusicBot(botData);
    bot.login();
});
