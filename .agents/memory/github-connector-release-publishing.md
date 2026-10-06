---
name: GitHub connector release publishing
description: Workaround for publishing Git commits through the GitHub connector when direct git authentication is unavailable.
---

Split Git Data API publishing into separate connector calls: read the base commit, create blobs, create the tree, create the commit, update the branch ref, then create the tag.

**Why:** A single large connector operation containing the complete sequence can fail inside the durable execution wrapper with a `null does not match type Pattern` replay error before the GitHub writes complete.

**How to apply:** When shell `git push` lacks credentials but the GitHub connector is authorized, perform and verify each Git Data API step in its own execution block. Update the branch ref without force and create the release tag only after the branch update succeeds.

Preserve the existing local commit instead of publishing a different commit with equivalent file contents.

**Why:** Recreating commits with new metadata makes local and remote histories diverge unnecessarily.

**How to apply:** Upload the changed blobs, recreate and verify the exact local tree, and supply the original parent, author, committer, timestamps, and full commit message. Require the returned commit SHA to match the local SHA before updating the remote branch without force. After verifying the remote ref, its matching local remote-tracking ref may be updated without changing the working branch.