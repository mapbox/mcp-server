FROM node:22-slim

# Create app directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies - completely skip prepare scripts during Docker build
RUN npm install --ignore-scripts

# Copy the rest of the application
COPY . .

# Create an empty version.json before the build to prevent errors
RUN mkdir -p dist && echo '{"sha":"unknown","tag":"unknown","branch":"docker","version":"0.0.1"}' > dist/version.json

# Build the application, overriding the git commands to avoid errors
RUN npx tshy

# Command to run the server
CMD ["node", "dist/esm/index.js"]
