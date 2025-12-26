# CHANGED: Updated to Node 20 to support @google/genai
FROM node:20-alpine

# Set working directory
WORKDIR /app

# 1. Install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# 2. Copy app files
COPY . .

# 3. Build the app
RUN npm run build

# 4. Fix Permissions for Hugging Face
RUN chown -R node:node /app

# 5. Switch User
USER node

# 6. Expose Port
EXPOSE 7860

# 7. Start Command
CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "7860"]