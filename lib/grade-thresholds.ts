/**
 * Official Cambridge International grade thresholds (minimum marks for each
 * grade), June 2026 and June 2025, for the grade predictor.
 *
 * Generated from the published grade threshold tables (each session's
 * `source` is the PDF it came from). Do not edit numbers by hand: when the
 * next session is published, regenerate and add it here.
 *
 * `factors` turn raw paper marks into Cambridge's weighted total. Accounting
 * (0452, 7707, 9706 AS papers) and IGCSE / O Level Economics (0455, 2281)
 * weight Paper 1 at 30% and Paper 2 at 70%; A Level Accounting adds Papers 3
 * and 4 at face value. Checked against the per-paper thresholds in the same
 * tables: the weighted totals match Cambridge's option thresholds to within
 * half a mark. Business (0450, 7115, 9609) and AS/A Level Economics (9708)
 * are plain sums.
 */
export type Qualification = "O Level" | "IGCSE" | "AS Level" | "A Level";

export interface ThresholdSet {
  /** Maximum weighted total. */
  max: number;
  /** Minimum weighted total for each grade, highest grade first. */
  thresholds: Record<string, number>;
}

export interface SyllabusThresholds {
  code: string;
  subject: "Accounting" | "Business" | "Economics";
  qualification: Qualification;
  /** Maximum raw mark of Paper 1, Paper 2, ... */
  papers: number[];
  /** Multiplier for each paper's raw mark to get the weighted total. */
  factors: number[];
  max: number;
  /** Keyed by session, then by paper variant ("1", "2", "3", "4"). */
  sessions: Record<string, { source: string; variants: Record<string, ThresholdSet> }>;
}

export const SESSIONS = ["June 2026", "June 2025"] as const;

export const THRESHOLDS: SyllabusThresholds[] = [
  {
    "code": "0452",
    "subject": "Accounting",
    "qualification": "IGCSE",
    "sessions": {
      "June 2026": {
        "source": "https://www.cambridgeinternational.org/Images/762815-accounting-0452-june-2026-grade-threshold-table.pdf",
        "variants": {
          "1": {
            "max": 143,
            "thresholds": {
              "A*": 100,
              "A": 80,
              "B": 60,
              "C": 40,
              "D": 34,
              "E": 29,
              "F": 23,
              "G": 17
            }
          },
          "2": {
            "max": 143,
            "thresholds": {
              "A*": 111,
              "A": 88,
              "B": 65,
              "C": 42,
              "D": 35,
              "E": 29,
              "F": 23,
              "G": 17
            }
          },
          "3": {
            "max": 143,
            "thresholds": {
              "A*": 100,
              "A": 80,
              "B": 60,
              "C": 40,
              "D": 34,
              "E": 29,
              "F": 23,
              "G": 17
            }
          }
        }
      },
      "June 2025": {
        "source": "https://www.cambridgeinternational.org/Images/741347-accounting-0452-june-2025-grade-threshold-table.pdf",
        "variants": {
          "1": {
            "max": 143,
            "thresholds": {
              "A*": 99,
              "A": 79,
              "B": 59,
              "C": 40,
              "D": 34,
              "E": 29,
              "F": 23,
              "G": 17
            }
          },
          "2": {
            "max": 143,
            "thresholds": {
              "A*": 105,
              "A": 83,
              "B": 61,
              "C": 40,
              "D": 34,
              "E": 29,
              "F": 23,
              "G": 17
            }
          },
          "3": {
            "max": 143,
            "thresholds": {
              "A*": 99,
              "A": 79,
              "B": 59,
              "C": 40,
              "D": 34,
              "E": 29,
              "F": 23,
              "G": 17
            }
          }
        }
      }
    },
    "papers": [
      35,
      100
    ],
    "factors": [
      1.225714,
      1.001
    ],
    "max": 143
  },
  {
    "code": "0450",
    "subject": "Business",
    "qualification": "IGCSE",
    "sessions": {
      "June 2026": {
        "source": "https://www.cambridgeinternational.org/Images/762814-business-studies-0450-june-2026-grade-threshold-table.pdf",
        "variants": {
          "1": {
            "max": 160,
            "thresholds": {
              "A*": 95,
              "A": 80,
              "B": 65,
              "C": 50,
              "D": 42,
              "E": 34,
              "F": 26,
              "G": 18
            }
          },
          "2": {
            "max": 160,
            "thresholds": {
              "A*": 105,
              "A": 89,
              "B": 73,
              "C": 57,
              "D": 48,
              "E": 39,
              "F": 29,
              "G": 19
            }
          },
          "3": {
            "max": 160,
            "thresholds": {
              "A*": 97,
              "A": 80,
              "B": 63,
              "C": 46,
              "D": 39,
              "E": 32,
              "F": 26,
              "G": 20
            }
          }
        }
      },
      "June 2025": {
        "source": "https://www.cambridgeinternational.org/Images/741357-business-studies-0450-june-2025-grade-threshold-table.pdf",
        "variants": {
          "1": {
            "max": 160,
            "thresholds": {
              "A*": 97,
              "A": 81,
              "B": 65,
              "C": 49,
              "D": 40,
              "E": 32,
              "F": 25,
              "G": 18
            }
          },
          "2": {
            "max": 160,
            "thresholds": {
              "A*": 106,
              "A": 89,
              "B": 72,
              "C": 56,
              "D": 47,
              "E": 38,
              "F": 28,
              "G": 18
            }
          },
          "3": {
            "max": 160,
            "thresholds": {
              "A*": 104,
              "A": 87,
              "B": 70,
              "C": 54,
              "D": 45,
              "E": 37,
              "F": 28,
              "G": 19
            }
          }
        }
      }
    },
    "papers": [
      80,
      80
    ],
    "factors": [
      1,
      1
    ],
    "max": 160
  },
  {
    "code": "0455",
    "subject": "Economics",
    "qualification": "IGCSE",
    "sessions": {
      "June 2026": {
        "source": "https://www.cambridgeinternational.org/Images/762817-economics-0455-june-2026-grade-threshold-table.pdf",
        "variants": {
          "1": {
            "max": 150,
            "thresholds": {
              "A*": 118,
              "A": 102,
              "B": 86,
              "C": 71,
              "D": 62,
              "E": 54,
              "F": 44,
              "G": 34
            }
          },
          "2": {
            "max": 150,
            "thresholds": {
              "A*": 115,
              "A": 97,
              "B": 79,
              "C": 62,
              "D": 52,
              "E": 43,
              "F": 35,
              "G": 27
            }
          },
          "3": {
            "max": 150,
            "thresholds": {
              "A*": 122,
              "A": 103,
              "B": 84,
              "C": 66,
              "D": 57,
              "E": 49,
              "F": 40,
              "G": 31
            }
          }
        }
      },
      "June 2025": {
        "source": "https://www.cambridgeinternational.org/Images/741372-economics-0455-june-2025-grade-threshold-table.pdf",
        "variants": {
          "1": {
            "max": 150,
            "thresholds": {
              "A*": 114,
              "A": 97,
              "B": 80,
              "C": 63,
              "D": 55,
              "E": 47,
              "F": 37,
              "G": 27
            }
          },
          "2": {
            "max": 150,
            "thresholds": {
              "A*": 125,
              "A": 106,
              "B": 87,
              "C": 68,
              "D": 58,
              "E": 48,
              "F": 38,
              "G": 28
            }
          },
          "3": {
            "max": 150,
            "thresholds": {
              "A*": 115,
              "A": 98,
              "B": 81,
              "C": 65,
              "D": 56,
              "E": 47,
              "F": 37,
              "G": 27
            }
          }
        }
      }
    },
    "papers": [
      30,
      90
    ],
    "factors": [
      1.5,
      1.166667
    ],
    "max": 150
  },
  {
    "code": "7707",
    "subject": "Accounting",
    "qualification": "O Level",
    "sessions": {
      "June 2026": {
        "source": "https://www.cambridgeinternational.org/Images/762889-accounting-7707-june-2026-grade-threshold-table.pdf",
        "variants": {
          "1": {
            "max": 143,
            "thresholds": {
              "A*": 100,
              "A": 80,
              "B": 60,
              "C": 40,
              "D": 34,
              "E": 29
            }
          },
          "2": {
            "max": 143,
            "thresholds": {
              "A*": 111,
              "A": 88,
              "B": 65,
              "C": 42,
              "D": 35,
              "E": 29
            }
          }
        }
      },
      "June 2025": {
        "source": "https://www.cambridgeinternational.org/Images/741485-accounting-7707-june-2025-grade-threshold-table.pdf",
        "variants": {
          "1": {
            "max": 143,
            "thresholds": {
              "A*": 99,
              "A": 79,
              "B": 59,
              "C": 40,
              "D": 34,
              "E": 29
            }
          },
          "2": {
            "max": 143,
            "thresholds": {
              "A*": 105,
              "A": 83,
              "B": 61,
              "C": 40,
              "D": 34,
              "E": 29
            }
          }
        }
      }
    },
    "papers": [
      35,
      100
    ],
    "factors": [
      1.225714,
      1.001
    ],
    "max": 143
  },
  {
    "code": "7115",
    "subject": "Business",
    "qualification": "O Level",
    "sessions": {
      "June 2026": {
        "source": "https://www.cambridgeinternational.org/Images/762897-business-studies-7115-june-2026-grade-threshold-table.pdf",
        "variants": {
          "1": {
            "max": 160,
            "thresholds": {
              "A*": 95,
              "A": 80,
              "B": 65,
              "C": 50,
              "D": 42,
              "E": 34
            }
          },
          "2": {
            "max": 160,
            "thresholds": {
              "A*": 105,
              "A": 89,
              "B": 73,
              "C": 57,
              "D": 48,
              "E": 39
            }
          }
        }
      },
      "June 2025": {
        "source": "https://www.cambridgeinternational.org/Images/741493-business-studies-7115-june-2025-grade-threshold-table.pdf",
        "variants": {
          "1": {
            "max": 160,
            "thresholds": {
              "A*": 97,
              "A": 81,
              "B": 65,
              "C": 49,
              "D": 40,
              "E": 32
            }
          },
          "2": {
            "max": 160,
            "thresholds": {
              "A*": 106,
              "A": 89,
              "B": 72,
              "C": 56,
              "D": 47,
              "E": 38
            }
          }
        }
      }
    },
    "papers": [
      80,
      80
    ],
    "factors": [
      1,
      1
    ],
    "max": 160
  },
  {
    "code": "2281",
    "subject": "Economics",
    "qualification": "O Level",
    "sessions": {
      "June 2026": {
        "source": "https://www.cambridgeinternational.org/Images/762902-economics-2281-june-2026-grade-threshold-table.pdf",
        "variants": {
          "1": {
            "max": 150,
            "thresholds": {
              "A*": 118,
              "A": 102,
              "B": 86,
              "C": 71,
              "D": 62,
              "E": 54
            }
          },
          "2": {
            "max": 150,
            "thresholds": {
              "A*": 115,
              "A": 97,
              "B": 79,
              "C": 62,
              "D": 52,
              "E": 43
            }
          }
        }
      },
      "June 2025": {
        "source": "https://www.cambridgeinternational.org/Images/741498-economics-2281-june-2025-grade-threshold-table.pdf",
        "variants": {
          "1": {
            "max": 150,
            "thresholds": {
              "A*": 114,
              "A": 97,
              "B": 80,
              "C": 63,
              "D": 55,
              "E": 47
            }
          },
          "2": {
            "max": 150,
            "thresholds": {
              "A*": 125,
              "A": 106,
              "B": 87,
              "C": 68,
              "D": 58,
              "E": 48
            }
          }
        }
      }
    },
    "papers": [
      30,
      90
    ],
    "factors": [
      1.5,
      1.166667
    ],
    "max": 150
  },
  {
    "code": "9706",
    "subject": "Accounting",
    "qualification": "AS Level",
    "sessions": {
      "June 2026": {
        "source": "https://www.cambridgeinternational.org/Images/761528-accounting-9706-june-2026-grade-threshold-table.pdf",
        "variants": {
          "1": {
            "max": 125,
            "thresholds": {
              "A": 85,
              "B": 70,
              "C": 57,
              "D": 44,
              "E": 32
            }
          },
          "2": {
            "max": 125,
            "thresholds": {
              "A": 85,
              "B": 71,
              "C": 58,
              "D": 46,
              "E": 34
            }
          },
          "3": {
            "max": 125,
            "thresholds": {
              "A": 85,
              "B": 70,
              "C": 57,
              "D": 44,
              "E": 32
            }
          }
        }
      },
      "June 2025": {
        "source": "https://www.cambridgeinternational.org/Images/740281-accounting-9706-june-2025-grade-threshold-table.pdf",
        "variants": {
          "1": {
            "max": 125,
            "thresholds": {
              "A": 86,
              "B": 70,
              "C": 57,
              "D": 45,
              "E": 33
            }
          },
          "2": {
            "max": 125,
            "thresholds": {
              "A": 89,
              "B": 74,
              "C": 60,
              "D": 46,
              "E": 33
            }
          },
          "3": {
            "max": 125,
            "thresholds": {
              "A": 86,
              "B": 70,
              "C": 57,
              "D": 45,
              "E": 33
            }
          }
        }
      }
    },
    "papers": [
      30,
      90
    ],
    "factors": [
      1.25,
      0.972222
    ],
    "max": 125
  },
  {
    "code": "9706",
    "subject": "Accounting",
    "qualification": "A Level",
    "sessions": {
      "June 2026": {
        "source": "https://www.cambridgeinternational.org/Images/761528-accounting-9706-june-2026-grade-threshold-table.pdf",
        "variants": {
          "1": {
            "max": 250,
            "thresholds": {
              "A*": 192,
              "A": 164,
              "B": 136,
              "C": 114,
              "D": 92,
              "E": 70
            }
          },
          "2": {
            "max": 250,
            "thresholds": {
              "A*": 189,
              "A": 162,
              "B": 135,
              "C": 113,
              "D": 91,
              "E": 69
            }
          },
          "3": {
            "max": 250,
            "thresholds": {
              "A*": 192,
              "A": 164,
              "B": 136,
              "C": 114,
              "D": 92,
              "E": 70
            }
          }
        }
      },
      "June 2025": {
        "source": "https://www.cambridgeinternational.org/Images/740281-accounting-9706-june-2025-grade-threshold-table.pdf",
        "variants": {
          "2": {
            "max": 250,
            "thresholds": {
              "A*": 197,
              "A": 169,
              "B": 141,
              "C": 119,
              "D": 97,
              "E": 75
            }
          },
          "3": {
            "max": 250,
            "thresholds": {
              "A*": 195,
              "A": 166,
              "B": 137,
              "C": 116,
              "D": 95,
              "E": 75
            }
          }
        }
      }
    },
    "papers": [
      30,
      90,
      75,
      50
    ],
    "factors": [
      1.25,
      0.972222,
      1,
      1
    ],
    "max": 250
  },
  {
    "code": "9609",
    "subject": "Business",
    "qualification": "AS Level",
    "sessions": {
      "June 2026": {
        "source": "https://www.cambridgeinternational.org/Images/761507-business-9609-june-2026-grade-threshold-table.pdf",
        "variants": {
          "1": {
            "max": 100,
            "thresholds": {
              "A": 78,
              "B": 72,
              "C": 64,
              "D": 56,
              "E": 48
            }
          },
          "2": {
            "max": 100,
            "thresholds": {
              "A": 77,
              "B": 71,
              "C": 64,
              "D": 57,
              "E": 50
            }
          },
          "3": {
            "max": 100,
            "thresholds": {
              "A": 75,
              "B": 69,
              "C": 61,
              "D": 54,
              "E": 47
            }
          }
        }
      },
      "June 2025": {
        "source": "https://www.cambridgeinternational.org/Images/740287-business-9609-june-2025-grade-threshold-table.pdf",
        "variants": {
          "1": {
            "max": 100,
            "thresholds": {
              "A": 75,
              "B": 68,
              "C": 61,
              "D": 54,
              "E": 47
            }
          },
          "2": {
            "max": 100,
            "thresholds": {
              "A": 81,
              "B": 74,
              "C": 67,
              "D": 60,
              "E": 53
            }
          },
          "3": {
            "max": 100,
            "thresholds": {
              "A": 81,
              "B": 74,
              "C": 67,
              "D": 60,
              "E": 53
            }
          }
        }
      }
    },
    "papers": [
      40,
      60
    ],
    "factors": [
      1,
      1
    ],
    "max": 100
  },
  {
    "code": "9609",
    "subject": "Business",
    "qualification": "A Level",
    "sessions": {
      "June 2026": {
        "source": "https://www.cambridgeinternational.org/Images/761507-business-9609-june-2026-grade-threshold-table.pdf",
        "variants": {
          "1": {
            "max": 200,
            "thresholds": {
              "A*": 157,
              "A": 146,
              "B": 135,
              "C": 119,
              "D": 104,
              "E": 89
            }
          },
          "2": {
            "max": 200,
            "thresholds": {
              "A*": 153,
              "A": 143,
              "B": 133,
              "C": 120,
              "D": 107,
              "E": 94
            }
          },
          "3": {
            "max": 200,
            "thresholds": {
              "A*": 155,
              "A": 143,
              "B": 131,
              "C": 116,
              "D": 102,
              "E": 88
            }
          }
        }
      },
      "June 2025": {
        "source": "https://www.cambridgeinternational.org/Images/740287-business-9609-june-2025-grade-threshold-table.pdf",
        "variants": {
          "1": {
            "max": 200,
            "thresholds": {
              "A*": 154,
              "A": 143,
              "B": 132,
              "C": 116,
              "D": 101,
              "E": 86
            }
          },
          "2": {
            "max": 200,
            "thresholds": {
              "A*": 154,
              "A": 143,
              "B": 132,
              "C": 119,
              "D": 106,
              "E": 94
            }
          },
          "3": {
            "max": 200,
            "thresholds": {
              "A*": 161,
              "A": 150,
              "B": 139,
              "C": 124,
              "D": 109,
              "E": 95
            }
          }
        }
      }
    },
    "papers": [
      40,
      60,
      60,
      40
    ],
    "factors": [
      1,
      1,
      1,
      1
    ],
    "max": 200
  },
  {
    "code": "9708",
    "subject": "Economics",
    "qualification": "AS Level",
    "sessions": {
      "June 2026": {
        "source": "https://www.cambridgeinternational.org/Images/761529-economics-9708-june-2026-grade-threshold-table.pdf",
        "variants": {
          "1": {
            "max": 90,
            "thresholds": {
              "A": 49,
              "B": 43,
              "C": 36,
              "D": 30,
              "E": 24
            }
          },
          "2": {
            "max": 90,
            "thresholds": {
              "A": 48,
              "B": 42,
              "C": 36,
              "D": 30,
              "E": 25
            }
          },
          "3": {
            "max": 90,
            "thresholds": {
              "A": 51,
              "B": 43,
              "C": 36,
              "D": 30,
              "E": 24
            }
          },
          "4": {
            "max": 90,
            "thresholds": {
              "A": 49,
              "B": 43,
              "C": 37,
              "D": 31,
              "E": 25
            }
          }
        }
      },
      "June 2025": {
        "source": "https://www.cambridgeinternational.org/Images/740318-economics-9708-june-2025-grade-threshold-table.pdf",
        "variants": {
          "4": {
            "max": 90,
            "thresholds": {
              "A": 48,
              "B": 41,
              "C": 35,
              "D": 29,
              "E": 23
            }
          },
          "1": {
            "max": 90,
            "thresholds": {
              "A": 48,
              "B": 41,
              "C": 34,
              "D": 27,
              "E": 21
            }
          },
          "2": {
            "max": 90,
            "thresholds": {
              "A": 49,
              "B": 43,
              "C": 36,
              "D": 30,
              "E": 24
            }
          },
          "3": {
            "max": 90,
            "thresholds": {
              "A": 48,
              "B": 40,
              "C": 33,
              "D": 26,
              "E": 20
            }
          }
        }
      }
    },
    "papers": [
      30,
      60
    ],
    "factors": [
      1,
      1
    ],
    "max": 90
  },
  {
    "code": "9708",
    "subject": "Economics",
    "qualification": "A Level",
    "sessions": {
      "June 2026": {
        "source": "https://www.cambridgeinternational.org/Images/761529-economics-9708-june-2026-grade-threshold-table.pdf",
        "variants": {
          "1": {
            "max": 180,
            "thresholds": {
              "A*": 124,
              "A": 109,
              "B": 94,
              "C": 82,
              "D": 70,
              "E": 59
            }
          },
          "2": {
            "max": 180,
            "thresholds": {
              "A*": 119,
              "A": 106,
              "B": 93,
              "C": 82,
              "D": 71,
              "E": 60
            }
          },
          "3": {
            "max": 180,
            "thresholds": {
              "A*": 128,
              "A": 111,
              "B": 94,
              "C": 82,
              "D": 70,
              "E": 59
            }
          },
          "4": {
            "max": 180,
            "thresholds": {
              "A*": 119,
              "A": 107,
              "B": 95,
              "C": 83,
              "D": 72,
              "E": 61
            }
          }
        }
      },
      "June 2025": {
        "source": "https://www.cambridgeinternational.org/Images/740318-economics-9708-june-2025-grade-threshold-table.pdf",
        "variants": {
          "4": {
            "max": 180,
            "thresholds": {
              "A*": 115,
              "A": 103,
              "B": 91,
              "C": 80,
              "D": 69,
              "E": 58
            }
          },
          "1": {
            "max": 180,
            "thresholds": {
              "A*": 120,
              "A": 105,
              "B": 90,
              "C": 78,
              "D": 67,
              "E": 56
            }
          },
          "2": {
            "max": 180,
            "thresholds": {
              "A*": 120,
              "A": 107,
              "B": 94,
              "C": 82,
              "D": 71,
              "E": 60
            }
          },
          "3": {
            "max": 180,
            "thresholds": {
              "A*": 121,
              "A": 105,
              "B": 89,
              "C": 77,
              "D": 66,
              "E": 55
            }
          }
        }
      }
    },
    "papers": [
      30,
      60,
      30,
      60
    ],
    "factors": [
      1,
      1,
      1,
      1
    ],
    "max": 180
  }
];
