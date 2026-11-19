// node --test src/*.test.ts (npm test here): the generator's lint and say (#1245, item 1) live beside their code in
// kit/gen; this brings their tests into the face's one test run.
import "./kit/gen/lint.test.ts";
import "./kit/gen/say.test.ts";
