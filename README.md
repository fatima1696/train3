# Train wheels video (Remotion + Three.js)

Vertical 9:16 (1080x1920), 30 fps, 1200 frames (40 s).

## Render on GitHub
1. Push this folder to a GitHub repo (branch `main`).
2. Open the **Actions** tab, choose **Render video**, tap **Run workflow**.
3. When it finishes, open the run and download the **train-wheels-video** artifact (MP4).

## Change the text
Open `src/TrainVideo.tsx` and edit only the `text` of each beat in `BEATS`.

## Add your voiceover
Put the audio in `public/` (for example `voice.mp3`) and set `VOICEOVER = 'voice.mp3'` in `src/TrainVideo.tsx`.

## Run on your computer (optional)
```
npm install
npm run dev      # preview in Remotion Studio
npm run render   # makes out/train-wheels.mp4
```
