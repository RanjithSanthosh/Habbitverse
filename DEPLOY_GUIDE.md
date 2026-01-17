# Deployment Guide to Vercel

To make your HabbitVerse application "Live" and have the scheduler run automatically:

## 1. Push Code to GitHub

1.  Initialize Git (if not already):
    ```bash
    git init
    git add .
    git commit -m "Initial commit"
    ```
2.  Create a new repository on GitHub.
3.  Push your code:
    ```bash
    git branch -M main
    git remote add origin <your-repo-url>
    git push -u origin main
    ```

## 2. Deploy to Vercel

1.  Go to [Vercel Dashboard](https://vercel.com/dashboard).
2.  Click **"Add New..."** -> **Project**.
3.  Import your GitHub repository.
4.  **Configure Environment Variables**:
    - Copy ALL values from your `.env.local` file.
    - Add them to the Vercel deployment settings one by one.
    - _Important_: Ensure `MONGODB_URI` permits access from anywhere (0.0.0.0/0) in Atlas.
5.  Click **Deploy**.

## 3. Verify Cron Job

1.  Once deployed, go to your Project Dashboard in Vercel.
2.  Click the **Settings** tab -> **Cron Jobs**.
3.  You should see one job listed: `/api/cron` running `* * * * *` (Every Minute).
4.  _Note: On Hobby (Free) plans, cron jobs may only run once per day or specifically when triggered. For 1-minute precision, you legally need a Pro plan OR use an external free trigger._

### Alternative: Free Cron Trigger (GitHub Actions)

If you are on Vercel Free Tier, use GitHub Actions to trigger the API every 5 minutes.
Create `.github/workflows/cron.yml`:

```yaml
name: Trigger Cron
on:
  schedule:
    - cron: "*/5 * * * *" # Every 5 minutes
jobs:
  cron:
    runs-on: ubuntu-latest
    steps:
      - name: Call API
        run: curl https://<your-vercel-app>.vercel.app/api/cron
```

## 4. Final Testing

1.  Create a reminder in your Live Dashboard.
2.  Wait for the time.
3.  Check WhatsApp.
