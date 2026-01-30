const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, VoiceConnectionStatus } = require('@discordjs/voice');
const config = require('./config.json');
require('dotenv').config();

// مصفوفة لتخزين جميع كائنات البوتات للوصول إليها من البوت القائد
const allBots = [];

class MusicBot {
    constructor(botConfig, index) {
        this.config = botConfig;
        this.index = index;
        this.isMaster = (index === 0); // البوت الأول هو القائد
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
            console.log(`[${this.isMaster ? 'MASTER' : 'BOT'}] ${this.client.user.tag} is ready!`);
            await this.autoJoin();
        });

        this.client.on('messageCreate', async (message) => {
            if (message.author.bot || !message.content.startsWith(config.prefix)) return;

            const args = message.content.slice(config.prefix.length).trim().split(/ +/);
            const command = args.shift().toLowerCase();

            // أوامر عامة لكل البوتات
            if (command === 'status') {
                message.reply(`🤖 **${this.config.name}** (${this.isMaster ? 'Master' : 'Sub-Bot'}) is online!`);
            }

            // أوامر خاصة بالبوت القائد فقط
            if (this.isMaster) {
                this.handleMasterCommands(message, command, args);
            }
        });
    }

    async handleMasterCommands(message, command, args) {
        // أمر لاستدعاء بوت معين إلى روم معين
        // مثال: !summon 2
        if (command === 'summon') {
            const botIndex = parseInt(args[0]) - 1;
            const targetBot = allBots[botIndex];
            const channel = message.member.voice.channel;

            if (!targetBot) return message.reply('❌ رقم البوت غير صحيح (1-7)');
            if (!channel) return message.reply('❌ يجب أن تكون في روم صوتي لاستدعاء البوت!');

            targetBot.joinChannel(channel.id, channel.guild.id, channel.guild.voiceAdapterCreator);
            message.reply(`✅ تم استدعاء **${targetBot.config.name}** إلى **${channel.name}**`);
        }

        // أمر لإخراج بوت معين
        if (command === 'dismiss') {
            const botIndex = parseInt(args[0]) - 1;
            const targetBot = allBots[botIndex];

            if (!targetBot) return message.reply('❌ رقم البوت غير صحيح');
            
            if (targetBot.connection) {
                targetBot.connection.destroy();
                targetBot.connection = null;
                message.reply(`👋 تم إخراج **${targetBot.config.name}** من الروم.`);
            } else {
                message.reply(`❌ البوت **${targetBot.config.name}** ليس في روم حالياً.`);
            }
        }

        // أمر لاستدعاء جميع البوتات إلى رومك
        if (command === 'summonall') {
            const channel = message.member.voice.channel;
            if (!channel) return message.reply('❌ يجب أن تكون في روم صوتي!');

            allBots.forEach(bot => {
                bot.joinChannel(channel.id, channel.guild.id, channel.guild.voiceAdapterCreator);
            });
            message.reply(`🚀 تم استدعاء جميع البوتات الـ ${allBots.length} إلى رومك!`);
        }

        // أمر لإخراج جميع البوتات
        if (command === 'dismissall') {
            allBots.forEach(bot => {
                if (bot.connection) {
                    bot.connection.destroy();
                    bot.connection = null;
                }
            });
            message.reply(`🧹 تم تنظيف جميع الرومات وإخراج كافة البوتات.`);
        }
    }

    async autoJoin() {
        if (this.config.channelId && this.config.channelId.length > 10) {
            try {
                const channel = await this.client.channels.fetch(this.config.channelId);
                if (channel && channel.isVoiceBased()) {
                    this.joinChannel(channel.id, channel.guild.id, channel.guild.voiceAdapterCreator);
                }
            } catch (err) {
                console.error(`[${this.config.name}] Auto-join failed: ${err.message}`);
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

// تشغيل البوتات وتخزينها في المصفوفة
config.bots.forEach((botData, index) => {
    const bot = new MusicBot(botData, index);
    allBots.push(bot);
    bot.login();
});
