const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const config = require('./config.json');
require('dotenv').config();

const allBots = [];

class MusicBot {
    constructor(botConfig, index) {
        this.config = botConfig;
        this.index = index;
        this.isMaster = (index === 0);
        this.currentChannelId = botConfig.channelId; // تخزين الروم الحالي لإعادة الاتصال به
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
        this.reconnectTimeout = null;

        this.setupEvents();
    }

    setupEvents() {
        this.client.once('ready', async () => {
            console.log(`[${this.isMaster ? 'MASTER' : 'BOT'}] ${this.client.user.tag} is ready!`);
            await this.autoJoin();
        });

        // مراقبة حالة الصوت لإعادة الاتصال التلقائي
        this.client.on('voiceStateUpdate', (oldState, newState) => {
            // إذا كان البوت هو من خرج من الروم
            if (oldState.member.id === this.client.user.id && newState.channelId === null) {
                console.log(`[${this.config.name}] Disconnected from voice. Reconnecting in 5 seconds...`);
                
                // تجنب تكرار محاولات إعادة الاتصال
                if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
                
                this.reconnectTimeout = setTimeout(() => {
                    this.autoJoin();
                }, 5000);
            }
        });

        this.client.on('messageCreate', async (message) => {
            if (message.author.bot || !message.content.startsWith(config.prefix)) return;

            const args = message.content.slice(config.prefix.length).trim().split(/ +/);
            const command = args.shift().toLowerCase();

            if (command === 'status') {
                const status = this.connection ? `Connected to <#${this.currentChannelId}>` : 'Disconnected';
                message.reply(`🤖 **${this.config.name}** (${this.isMaster ? 'Master' : 'Sub-Bot'}) is online!\nStatus: ${status}`);
            }

            if (this.isMaster) {
                this.handleMasterCommands(message, command, args);
            }
        });
    }

    async handleMasterCommands(message, command, args) {
        if (command === 'summon') {
            const botIndex = parseInt(args[0]) - 1;
            const targetBot = allBots[botIndex];
            const channel = message.member.voice.channel;

            if (!targetBot) return message.reply('❌ رقم البوت غير صحيح (1-7)');
            if (!channel) return message.reply('❌ يجب أن تكون في روم صوتي لاستدعاء البوت!');

            targetBot.currentChannelId = channel.id; // تحديث الروم المستهدف لإعادة الاتصال به مستقبلاً
            targetBot.joinChannel(channel.id, channel.guild.id, channel.guild.voiceAdapterCreator);
            message.reply(`✅ تم استدعاء **${targetBot.config.name}** إلى **${channel.name}** وسيبقى هناك.`);
        }

        if (command === 'dismiss') {
            const botIndex = parseInt(args[0]) - 1;
            const targetBot = allBots[botIndex];

            if (!targetBot) return message.reply('❌ رقم البوت غير صحيح');
            
            targetBot.currentChannelId = null; // مسح الروم المستهدف لمنع إعادة الاتصال التلقائي
            if (targetBot.connection) {
                targetBot.connection.destroy();
                targetBot.connection = null;
                message.reply(`👋 تم إخراج **${targetBot.config.name}** وإيقاف إعادة الاتصال التلقائي له.`);
            }
        }

        if (command === 'summonall') {
            const channel = message.member.voice.channel;
            if (!channel) return message.reply('❌ يجب أن تكون في روم صوتي!');

            allBots.forEach(bot => {
                bot.currentChannelId = channel.id;
                bot.joinChannel(channel.id, channel.guild.id, channel.guild.voiceAdapterCreator);
            });
            message.reply(`🚀 تم استدعاء جميع البوتات إلى **${channel.name}** مع تفعيل ميزة البقاء المتصل.`);
        }

        if (command === 'dismissall') {
            allBots.forEach(bot => {
                bot.currentChannelId = null;
                if (bot.connection) {
                    bot.connection.destroy();
                    bot.connection = null;
                }
            });
            message.reply(`🧹 تم إخراج جميع البوتات وإيقاف ميزة إعادة الاتصال التلقائي.`);
        }
    }

    async autoJoin() {
        if (this.currentChannelId && this.currentChannelId.length > 10) {
            try {
                const channel = await this.client.channels.fetch(this.currentChannelId);
                if (channel && channel.isVoiceBased()) {
                    this.joinChannel(channel.id, channel.guild.id, channel.guild.voiceAdapterCreator);
                    console.log(`[${this.config.name}] Successfully joined/reconnected to: ${channel.name}`);
                }
            } catch (err) {
                console.error(`[${this.config.name}] Auto-join failed: ${err.message}`);
            }
        }
    }

    joinChannel(channelId, guildId, adapterCreator) {
        if (this.connection) {
            this.connection.destroy();
        }

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
                if (this.currentChannelId) {
                    console.log(`[${this.config.name}] Connection lost. Attempting to reconnect...`);
                    this.autoJoin();
                }
            }
        });

        this.connection.subscribe(this.player);
    }

    login() {
        const token = this.config.token;
        if (token && token !== "TOKEN_X" && token.length > 10) {
            this.client.login(token).catch(err => {
                console.error(`[${this.config.name}] Login Failed: ${err.message}`);
            });
        }
    }
}

config.bots.forEach((botData, index) => {
    const bot = new MusicBot(botData, index);
    allBots.push(bot);
    bot.login();
});
