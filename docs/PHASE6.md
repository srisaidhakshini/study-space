# Study together

- **Shared tree.** Open **Study together** in the Garden to see the tree’s stage and the next milestone. Whole focus minutes recorded at any Garden seat count, including minutes from guest sessions and sessions ended early. The tree grows at 60, 300, and 1,200 minutes. Its total is shared across all rooms on the server host.
- **Buddy desks.** Blue markers in the Library show pairs of seats. When someone takes the paired seat, their name and focus or break status appear in the HUD. Choose **Sync with Buddy** in the timer panel on both screens within 45 seconds to share the first player's focus and break schedule. Either player can still stop their own timer.
- **Local-time indicator.** The People panel shows each player’s local time using the UTC offset reported by their browser on joining.
- **Focus ghost.** In the Library’s **Study together** panel, enable **Show my focus ghost at empty buddy seats**. Start a session at a buddy desk. A private ghost sits in the paired seat for up to the length of your latest positive-minute focus session saved on this device. It clears when you stop focusing or someone takes the seat. The preference is saved on this device.
- **Subject question boards.** Open **Study together** while online in the Library, Cafe, or Garden. Ask questions, reply, remove your own posts, or report another player’s post. Choose a subject to see its threads. Each room instance has a separate board per map and subject. Each subject board keeps the most recent 20 questions and up to eight replies each while that instance is running. You can read the board while focusing. Posting, removing, and reporting are paused until focus ends.

The tree counter is stored in `.study-tree.json` in the server’s working directory. Set `STUDY_TREE_FILE` to an absolute path on a persistent writable volume when the deployment replaces its working directory. Keep one server process per counter file. No database migration is required.

Run the Phase 6 regression checks after generating assets:

```sh
npm run assets
node --import tsx --test server/src/studyTogether/studyTogether.test.ts
```

## Friends and private buddy trees

Sign in and choose **Add friend** beside another signed-in player in **People**, or send the same request by name or email in **Friends**. The recipient can accept from either panel. An accepted friend can visit a friends-only home and shares a private buddy tree with you.

The tree grows while both friends focus in the same room instance, including from different maps. Removing a friend removes the shared tree. The migration carries forward existing friendships, buddy requests, and tree progress. Acceptance in either previous system takes precedence over a pending request.

Deploy the migrations with `npm run db:deploy -w server`. Run the integration test against a migrated test database with `node --import tsx --test server/src/studyTogether/buddies.test.ts`.
