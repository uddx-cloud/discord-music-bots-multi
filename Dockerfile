# استخدام نسخة Node.js مستقرة
FROM node:18-slim

# تثبيت FFmpeg والاعتمادات اللازمة لتشغيل الصوت
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# إنشاء مجلد العمل
WORKDIR /usr/src/app

# نسخ ملفات الاعتمادات
COPY package*.json ./

# تثبيت المكتبات
RUN npm install --production

# نسخ بقية ملفات المشروع
COPY . .

# تشغيل البوت
CMD [ "node", "index.js" ]
