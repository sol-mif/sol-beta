// The first way, the drafts' life: docs/cowork-ways-2026-11-10/sol.drafts.way.json, its text byte for byte (a .ts
// file, so the release export reads it as code: its role logins are a way's, not a team word in a document)
export const DRAFTS_WAY = String.raw`{
  "way": 1,
  "id": "sol.drafts",
  "name": "草稿生命週期",
  "prev": "",
  "zone": "America/New_York",
  "runner": "nucbox@frank",
  "roles": {
    "explorer": {
      "name": "探路的人",
      "who": [
        "person:marco"
      ]
    },
    "keeper": {
      "name": "顧地基的人",
      "who": [
        "person:frank"
      ]
    }
  },
  "things": {
    "draft": {
      "name": "草稿",
      "fields": {
        "title": "text",
        "switch": "name",
        "born": "time",
        "extended": "boolean?"
      }
    }
  },
  "life": {
    "draft": {
      "states": {
        "on_switch": {
          "name": "開關後面"
        },
        "wanted": {
          "name": "等轉正"
        },
        "official": {
          "name": "轉正",
          "end": true
        },
        "to_remove": {
          "name": "待拔",
          "enter": "switch.off"
        },
        "removed": {
          "name": "拔掉",
          "end": true
        }
      },
      "moves": [
        {
          "id": "make",
          "from": null,
          "to": "on_switch",
          "by": [
            "explorer"
          ],
          "set": [
            "title",
            "switch"
          ]
        },
        {
          "id": "want",
          "from": "on_switch",
          "to": "wanted",
          "by": [
            "explorer"
          ]
        },
        {
          "id": "extend",
          "from": [
            "on_switch",
            "wanted"
          ],
          "to": "same",
          "by": [
            "explorer"
          ],
          "when": "may_extend",
          "fix": {
            "extended": true
          }
        },
        {
          "id": "promote",
          "from": "wanted",
          "to": "official",
          "by": [
            "keeper"
          ],
          "when": "solid"
        },
        {
          "id": "drop",
          "from": [
            "on_switch",
            "wanted"
          ],
          "to": "to_remove",
          "by": [
            "explorer",
            "trigger:expire"
          ]
        },
        {
          "id": "pull",
          "from": "to_remove",
          "to": "removed",
          "by": [
            "keeper"
          ]
        }
      ]
    }
  },
  "rules": {
    "solid": {
      "all": [
        {
          "check": "contract.written"
        },
        {
          "check": "undo.works"
        },
        {
          "check": "data.ok"
        },
        {
          "check": "gate.green"
        },
        {
          "check": "used.enough"
        }
      ]
    },
    "not_extended": {
      "not": {
        "field": "extended",
        "is": true
      }
    },
    "may_extend": {
      "all": [
        {
          "rule": "not_extended"
        },
        {
          "not": {
            "rule": "expired"
          }
        }
      ]
    },
    "expired": {
      "any": [
        {
          "all": [
            {
              "field": "born",
              "older": "21d"
            },
            {
              "rule": "not_extended"
            }
          ]
        },
        {
          "field": "born",
          "older": "42d"
        }
      ]
    }
  },
  "triggers": {
    "remind": {
      "on": "daily 09:30",
      "if": {
        "all": [
          {
            "in": [
              "on_switch",
              "wanted"
            ]
          },
          {
            "field": "born",
            "older": "14d"
          },
          {
            "not": {
              "fired": "remind"
            }
          }
        ]
      },
      "do": {
        "ping": "explorer",
        "say": "轉正還是拔？"
      }
    },
    "expire": {
      "on": "daily 09:30",
      "if": {
        "all": [
          {
            "in": [
              "on_switch",
              "wanted"
            ]
          },
          {
            "rule": "expired"
          }
        ]
      },
      "do": {
        "move": "drop"
      }
    },
    "remind_again": {
      "on": "daily 09:30",
      "if": {
        "all": [
          {
            "in": [
              "on_switch",
              "wanted"
            ]
          },
          {
            "field": "extended",
            "is": true
          },
          {
            "field": "born",
            "older": "35d"
          },
          {
            "not": {
              "fired": "remind_again"
            }
          }
        ]
      },
      "do": {
        "ping": "explorer",
        "say": "延過一次了，一週後到期：轉正還是拔？"
      }
    }
  },
  "record": {
    "home": "team",
    "pings": "when it matters"
  },
  "views": {
    "auto": [
      "life",
      "board",
      "timeline"
    ],
    "parts": [
      {
        "id": "expiring",
        "part": "list",
        "of": "draft",
        "where": {
          "field": "born",
          "older": "14d"
        },
        "show": [
          "title",
          "born"
        ]
      }
    ],
    "pages": []
  },
  "seams": {
    "contract.written": {
      "plugin": "sol.contract",
      "pv": 1,
      "pkg": "sha256:tbd",
      "gives": "check"
    },
    "undo.works": {
      "plugin": "sol.undo",
      "pv": 1,
      "pkg": "sha256:tbd",
      "gives": "check"
    },
    "data.ok": {
      "plugin": "sol.data",
      "pv": 1,
      "pkg": "sha256:tbd",
      "gives": "check"
    },
    "gate.green": {
      "plugin": "sol.gate",
      "pv": 1,
      "pkg": "sha256:tbd",
      "gives": "check"
    },
    "used.enough": {
      "plugin": "sol.switches",
      "pv": 1,
      "pkg": "sha256:tbd",
      "gives": "check"
    },
    "switch.off": {
      "plugin": "sol.switches",
      "pv": 1,
      "pkg": "sha256:tbd",
      "gives": "act"
    }
  }
}`;
