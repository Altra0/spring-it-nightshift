# Submission tracker

**Deadline: 09:00 GMT, Sun 25 Oct 2026.** Mubit support (Shankha) extended submissions to 09:00 GMT at 06:54. **Our own hard stop for `main` is 08:45.** Until then: fixes and polish only, merged to `main`, and verified that it builds. Judges look at `main` as it is at the deadline, this repo's README, and the demo video.

## Log
- 06:20 Freeze announced as 07:00 London; README and tracker written.
- ~06:25 Check-in #2 submitted.
- 06:54 Deadline extended to 09:00 GMT. A safe version was submitted for the 07:00 countdown; we resubmit before 09:00.
- SOP training: all 72 reports landed in Mubit task "Spring It 3" (1 resent after a 502).

## By 08:45 (hard stop for main)
- [ ] Every stream has merged what works to `main`. No new features after this.
- [ ] `main` builds (`npm run build`) and runs in production (`npm start -- -p 3002`), with no reloads or flashes on `/radio` and the desk.
- [ ] `npm run demo -- --keep-facts` passes.
- [ ] README explains what Spring It is and what the demo shows.

## Submit (safe version done; resubmit before 09:00)
- [ ] Post `/submit` in the team channel **#max**.
- [ ] Team name: **Spring It**.
- [ ] Both members' full names and emails.
- [ ] Repo URL: https://github.com/Altra0/spring-it-nightshift
- [ ] README URL: https://github.com/Altra0/spring-it-nightshift/blob/main/README.md
- [ ] Upload the demo video: MP4 or MOV, at most 2 minutes and 300 MB.

## Before recording the demo
- [ ] `npm run demo -- --keep-facts` passes on the iMac (clean demo state, SOP facts kept).
- [ ] Mubit console open on task "Spring It 3" to show kept examples and adapter history.
- [ ] Radio receive tested. The reply plays on the speaker (no AIOC cable yet).
