---
question: How to start the timer at autostart / after log-in
order: 4
---

We'll explore reminding to resume the timer in future versions. For now, you can use:

1. Disable the autostart toggle in the app
2. Create file `~/.config/autostart/io.github.focustimerhq.FocusTimer (custom).desktop`:

```
[Desktop Entry]
Type=Application
Name=io.github.focustimerhq.FocusTimer
Exec=flatpak run --command=focus-timer io.github.focustimerhq.FocusTimer --gapplication-service --start-pomodoro
```
