# Vision: a model per building

Mubit lets Spring It deliver a model per building. Every report a building's team
radios in goes through Mubit, and every manager correction becomes a fact that shapes
the next answer. Mubit keeps the right answers as examples and trains an adapter on
them, so each building ends up with its own model that knows its own doors, gates,
contractors and rules.

For the hackathon there is one building. Beyond it, the real hierarchy is
**Org > Estate > Building**. Each customer unit can get its own specific model,
trained on its own SOPs and its own managers' corrections:

- **Building**: the doors, gates, escape routes and contractors of one site.
- **Estate**: the rules shared across an estate's buildings, the way an estate
  manager runs things.
- **Org**: the operator's policies and standards across every estate.

A correction made at one level teaches that level's model, without leaking into
another customer's.
