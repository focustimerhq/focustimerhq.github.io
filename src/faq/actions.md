---
question: How to set up Custom Actions
order: 6
---

Decide if your action needs a “switch off” command, if yes — use Conditions over Events. Set it up using dummy commands, like `echo` and debug it using `Log` window. Once you're happy with the behaviour, use real commands. For more complex behaviours you may need to write custom scripts, pass variables in arguments or toggle “Pass Input Data” and handle JSON from `stdin`.
