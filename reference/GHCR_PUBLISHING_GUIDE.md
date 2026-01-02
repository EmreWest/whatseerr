# Publishing to GitHub Container Registry (GHCR)

This guide explains how to publish the WhatSeerr Docker image to GitHub Container Registry (GHCR) for easy distribution.

## Prerequisites

1. GitHub repository: `https://github.com/SuFxGIT/whatseerr`
2. GitHub account with write access to the repository
3. Docker installed locally (for manual publishing)

## Automatic Publishing with GitHub Actions

The repository includes a GitHub Actions workflow that automatically builds and publishes Docker images to GHCR.

### How It Works

The workflow (`.github/workflows/docker-publish.yml`) automatically triggers on:

- **Push to `main` branch**: Builds and publishes with `latest` tag
- **Creating version tags** (e.g., `v1.0.0`): Builds and publishes with version tags
- **Pull Requests**: Builds only (doesn't publish)
- **Manual trigger**: Can be run manually from GitHub Actions tab

### Setting Up Automatic Publishing

1. **Push the workflow file to your repository:**
   ```bash
   git add .github/workflows/docker-publish.yml
   git commit -m "Add GitHub Actions workflow for GHCR publishing"
   git push origin main
   ```

2. **Enable GitHub Actions:**
   - Go to your repository on GitHub
   - Navigate to **Settings** → **Actions** → **General**
   - Under "Workflow permissions", ensure **Read and write permissions** is selected
   - Click **Save**

3. **Configure Package Visibility:**
   - After the first build, go to your GitHub profile
   - Click **Packages** tab
   - Find the `whatseerr` package
   - Click on it, then **Package settings**
   - Under **Danger Zone**, you can:
     - Change visibility to **Public** (anyone can pull) or keep **Private** (requires authentication)
     - Link it to your repository for better organization

### Triggering a Build

**Option 1: Push to main branch**
```bash
git add .
git commit -m "Update application"
git push origin main
```

**Option 2: Create a version tag**
```bash
git tag v1.0.0
git push origin v1.0.0
```

**Option 3: Manual trigger**
- Go to **Actions** tab in GitHub
- Select "Build and Push Docker Image to GHCR"
- Click **Run workflow**
- Select branch and click **Run workflow**

### Image Tags Generated

The workflow automatically creates multiple tags:

- `latest` - Latest build from main branch
- `v1.0.0`, `v1.0`, `v1` - Version tags (when you tag a release)
- `main-<sha>` - Branch name with commit SHA
- PR tags for pull requests

## Manual Publishing to GHCR

If you prefer to publish manually or need to publish from your local machine:

### 1. Authenticate with GHCR

Create a Personal Access Token (PAT):
1. Go to GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**
2. Click **Generate new token (classic)**
3. Give it a name like "GHCR Docker Push"
4. Select scopes:
   - `write:packages` (to upload packages)
   - `read:packages` (to download packages)
   - `delete:packages` (optional, to delete packages)
5. Click **Generate token**
6. Copy the token (you won't see it again!)

Login to GHCR:
```bash
echo "YOUR_GITHUB_TOKEN" | docker login ghcr.io -u SuFxGIT --password-stdin
```

### 2. Build the Image

```bash
cd /mnt/user/other/projects/whatsapprequests
docker build -t ghcr.io/sufxgit/whatseerr:latest .
```

### 3. Tag the Image (Optional, for versions)

```bash
# Tag with version
docker tag ghcr.io/sufxgit/whatseerr:latest ghcr.io/sufxgit/whatseerr:v1.0.0

# Tag with major.minor
docker tag ghcr.io/sufxgit/whatseerr:latest ghcr.io/sufxgit/whatseerr:v1.0
```

### 4. Push to GHCR

```bash
# Push latest
docker push ghcr.io/sufxgit/whatseerr:latest

# Push version tags
docker push ghcr.io/sufxgit/whatseerr:v1.0.0
docker push ghcr.io/sufxgit/whatseerr:v1.0
```

## Using the Published Image

### Public Package (No Authentication)

If you set the package visibility to public:

```bash
# Pull the image
docker pull ghcr.io/sufxgit/whatseerr:latest

# Run the container
docker run -d \
  --name whatseerr-bot \
  --restart unless-stopped \
  -p 3006:3006 \
  -v $(pwd)/config:/config:ro \
  ghcr.io/sufxgit/whatseerr:latest
```

### Private Package (Requires Authentication)

If the package is private:

1. **Create a PAT with `read:packages` scope** (as described above)

2. **Login to GHCR:**
   ```bash
   echo "YOUR_GITHUB_TOKEN" | docker login ghcr.io -u SuFxGIT --password-stdin
   ```

3. **Pull and run:**
   ```bash
   docker pull ghcr.io/sufxgit/whatseerr:latest
   docker run -d \
     --name whatseerr-bot \
     --restart unless-stopped \
     -p 3006:3006 \
     -v $(pwd)/config:/config:ro \
     ghcr.io/sufxgit/whatseerr:latest
   ```

## Using with Docker Compose

Update your `docker-compose.yml` to use the GHCR image:

```yaml
services:
  whatsapp-bot:
    image: ghcr.io/sufxgit/whatseerr:latest  # Use pre-built image
    # Remove the 'build: .' line
    container_name: whatseerr-bot-dev
    restart: unless-stopped
    ports:
      - "3006:3006"
    volumes:
      - ./config:/config:ro
    environment:
      - NODE_ENV=production
      - WEBHOOK_EXTERNAL_PORT=3006
      - TZ=Asia/Kuwait
```

For private packages, login first:
```bash
echo "YOUR_GITHUB_TOKEN" | docker login ghcr.io -u SuFxGIT --password-stdin
docker-compose pull
docker-compose up -d
```

## Viewing Published Packages

1. Go to your GitHub profile: `https://github.com/SuFxGIT`
2. Click the **Packages** tab
3. You'll see your `whatseerr` package listed
4. Click on it to see:
   - All published versions/tags
   - Pull statistics
   - Package settings
   - Installation instructions

## Best Practices

1. **Version your releases:**
   ```bash
   git tag -a v1.0.0 -m "Release version 1.0.0"
   git push origin v1.0.0
   ```

2. **Keep `latest` tag for main branch** - The workflow does this automatically

3. **Use semantic versioning** (v1.0.0, v1.1.0, v2.0.0)

4. **Test before tagging** - Ensure your code works before creating version tags

5. **Link package to repository** - Makes it easier for users to find

6. **Add package description** - Helps users understand what the package is for

## Troubleshooting

### Build fails in GitHub Actions
- Check the Actions tab for detailed error logs
- Ensure Dockerfile is valid
- Verify all dependencies are available

### Permission denied when pushing
- Verify your token has `write:packages` scope
- Check repository settings allow GitHub Actions to write packages

### Can't pull private image
- Ensure you're logged in: `docker login ghcr.io`
- Verify your token has `read:packages` scope
- Check package visibility settings

### Image not appearing in package list
- Wait a few minutes after first push
- Check Actions tab to ensure workflow completed successfully
- Verify workflow has correct permissions

## Additional Resources

- [GitHub Packages Documentation](https://docs.github.com/en/packages)
- [Working with GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [GitHub Actions Docker Documentation](https://docs.github.com/en/actions/publishing-packages/publishing-docker-images)
