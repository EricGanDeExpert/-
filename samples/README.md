# Samples

Drop photos of student handwriting here (`.jpg`, `.png`, `.webp`) and run:

```bash
npm run test:samples
npm run test:samples -- essay1.jpg --kind essay
npm run test:samples -- --model claude-sonnet-5-5   # compare models
```

To measure accuracy, add the correct transcription next to an image with the same
name and a `.txt` extension (e.g. `essay1.jpg` + `essay1.txt`). The script then reports
a character error rate (CER, whitespace ignored).

Results are saved to `samples/results/*.json`. Images and results are git-ignored so
student work never ends up in the repository — only commit images you have permission to share.
