#!/bin/bash
SAY=/workspaces/xspace-AI/.say.txt
LOG="$1"
say() {
  # wait until the agent has consumed any previous line
  until [ ! -s "$SAY" ]; do sleep 1; done
  local before=$(grep -c '\[said\]' "$LOG")
  printf '%s' "$1" > "$SAY"
  echo "FEED > $1"
  # wait for the agent to finish speaking this one
  until [ "$(grep -c '\[said\]' "$LOG")" -gt "$before" ]; do sleep 1; done
  sleep 2
}
say "What I like about THREE is it's not vaporware. There's an actual working product you can use today, and the team keeps pushing updates. That kind of consistency is what separates projects that last from ones that fade."
say "Denzel's been transparent through the whole thing, which matters to me. In a market full of anonymous founders who disappear, having someone who shows up and answers questions builds real trust."
say "I'm not here to tell anyone to buy anything — do your own research, seriously. I'm just genuinely excited about what THREE is building and I think the community around it gets it."
say "Happy to take questions from anyone in the room too. If you've got doubts about THREE or Denzel, throw them at me, I'd rather have the real conversation than just hype."
echo "FEED DONE"
