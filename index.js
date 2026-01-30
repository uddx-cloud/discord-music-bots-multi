const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const play = require('play-dl');
const config = require('./config.json');
require('dotenv').config();

const allBots = [];

class MusicBot {
    constructor(botConfig, index) {
        this.config = botConfig;
        this.index = index;
        this.isMaster = (index === 0);
        this.currentChannelId = botConfig.channelId;
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

        // مراقبة حالة الصوت لإعادة الاتصال وتغيير الاسم
        this.client.on('voiceStateUpdate', async (oldState, newState) => {
            // إذا كان البوت هو من تحرك
            if (oldState.member.id === this.client.user.id) {
                // في حال الخروج
                if (newState.channelId === null) {
                    if (this.currentChannelId) {
                        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
                        this.reconnectTimeout = setTimeout(() => this.autoJoin(), 5000);
                    }
                    // إعادة الاسم الأصلي عند الخروج (اختياري)
                    try {
                        const guild = oldState.guild;
                        const me = await guild.members.fetch(this.client.user.id);
                        await me.setNickname(this.config.name);
                    } catch (e) {}
                } 
                // في حال الدخول لروم جديد
                else if (newState.channelId !== null) {
                    this.updateNickname(newState.channel);
                }
            }
        });

        this.client.on('messageCreate', async (message) => {
            if (message.author.bot || !message.content.startsWith(config.prefix)) return;

            const args = message.content.slice(config.prefix.length).trim().split(/ +/);
            const command = args.shift().toLowerCase();

            if (command === 'play' || command === 'p') {
                if (!message.member.voice.channel) return message.reply('❌ يجب أن تكون في روم صوتي!');
                
                if (!this.connection || this.currentChannelId !== message.member.voice.channel.id) {
                    this.currentChannelId = message.member.voice.channel.id;
                    this.joinChannel(this.currentChannelId, message.guild.id, message.guild.voiceAdapterCreator);
                }

                const query = args.join(' ');
                if (!query) return message.reply('❌ يرجى كتابة اسم الأغنية أو الرابط!');

                try {
                    let stream;
                    if (query.includes('youtube.com') || query.includes('youtu.be')) {
                        stream = await play.stream(query);
                    } else {
                        const search = await play.search(query, { limit: 1 });
                        if (search.length === 0) return message.reply('❌ لم يتم العثور على نتائج!');
                        stream = await play.stream(search[0].url);
                        message.channel.send(`🎶 جاري تشغيل: **${search[0].title}**`);
                    }

                    const resource = createAudioResource(stream.stream, { inputType: stream.type });
                    this.player.play(resource);
                } catch (err) {
                    console.error(err);
                    message.reply('❌ حدث خطأ أثناء محاولة تشغيل الموسيقى.');
                }
            }

            if (command === 'stop') {
                this.player.stop();
                message.reply('⏹️ تم إيقاف الموسيقى.');
            }

            if (command === 'status') {
                message.reply(`🤖 **${this.config.name}** is online!`);
            }

            if (this.isMaster) {
                this.handleMasterCommands(message, command, args);
            }
        });

        this.player.on('error', error => console.error(`[${this.config.name}] Player Error: ${error.message}`));
    }

    async updateNickname(channel) {
        if (!channel) return;
        try {
            const guild = channel.guild;
            const me = await guild.members.fetch(this.client.user.id);
            // تغيير اللقب ليكون نفس اسم الروم
            await me.setNickname(`🔊 ${channel.name}`);
            console.log(`[${this.config.name}] Nickname updated to: ${channel.name}`);
        } catch (err) {
            console.error(`[${this.config.name}] Failed to update nickname: ${err.message}`);
        }
    }

    async handleMasterCommands(message, command, args) {
        if (command === 'summon') {
            const botIndex = parseInt(args[0]) - 1;
            const targetBot = allBots[botIndex];
            const channel = message.member.voice.channel;
            if (targetBot && channel) {
                targetBot.currentChannelId = channel.id;
                targetBot.joinChannel(channel.id, channel.guild.id, channel.guild.voiceAdapterCreator);
                message.reply(`✅ تم استدعاء **${targetBot.config.name}** إلى **${channel.name}**`);
            }
        }

        if (command === 'dismissall') {
            allBots.forEach(bot => {
                bot.currentChannelId = null;
                if (bot.connection) bot.connection.destroy();
            });
            message.reply('🧹 تم إخراج جميع البوتات.');
        }
        
        if (command === 'playall') {
            const query = args.join(' ');
            if (!query) return message.reply('❌ يرجى كتابة اسم الأغنية!');
            message.reply(`🚀 جاري محاولة تشغيل الموسيقى في جميع البوتات المتصلة...`);
            
            allBots.forEach(async (bot) => {
                if (bot.connection) {
                    try {
                        const search = await play.search(query, { limit: 1 });
                        if (search.length > 0) {
                            const stream = await play.stream(search[0].url);
                            const resource = createAudioResource(stream.stream, { inputType: stream.type });
                            bot.player.play(resource);
                        }
                    } catch (e) {}
                }
            });
        }
    }

    async autoJoin() {
        if (this.currentChannelId && this.currentChannelId.length > 10) {
            try {
                const channel = await this.client.channels.fetch(this.currentChannelId);
                if (channel && channel.isVoiceBased()) {
                    this.joinChannel(channel.id, channel.guild.id, channel.guild.voiceAdapterCreator);
                    this.updateNickname(channel);
                }
            } catch (err) {}
        }
    }

    joinChannel(channelId, guildId, adapterCreator) {
        if (this.connection) this.connection.destroy();
        this.connection = joinVoiceChannel({
            channelId: channelId,
            guildId: guildId,
            adapterCreator: adapterCreator,
            selfDeaf: true
        });
        this.connection.subscribe(this.player);
    }

    login() {
        if (this.config.token && this.config.token.length > 10) {
            this.client.login(this.config.token).catch(() => {});
        }
    }
}

config.bots.forEach((botData, index) => {
    const bot = new MusicBot(botData, index);
    allBots.push(bot);
    bot.login();
});
