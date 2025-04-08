import React, { useState, useEffect } from "react";
import "./CipherGame.css";
import seedrandom from "seedrandom";

// Fixed cipher rule remains unchanged.
const fixedCipherRule = {
  a: "m", b: "n", c: "b", d: "v", e: "c", f: "x", g: "z", h: "l", i: "k", j: "j",
  k: "h", l: "g", m: "f", n: "d", o: "s", p: "a", q: "p", r: "o", s: "i", t: "u",
  u: "y", v: "t", w: "r", x: "e", y: "w", z: "q"
};
// Global systematic indices for all grammarly rounds (if provided in data)
let globalGrammarlySystematicIndices = null; // ← (added global variable)
// Global accuracy rate for all grammarly rounds (if provided in data)
let globalGrammarlyAccuracyRate = null; // ← (new global variable for accuracy rate)

const shuffleArray = (array, rng) => {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

const cipherCache = {};

const CipherGame = () => {
  const [data, setData] = useState(null);
  const [round, setRound] = useState(0);
  const [cipherText, setCipherText] = useState("");
  const [userThinksCorrect, setUserThinksCorrect] = useState(false);
  const [userThinksCorrectExplicitlySet, setUserThinksCorrectExplicitlySet] = useState(false);
  const [incorrectIndices, setIncorrectIndices] = useState([]);
  const [continueVisible, setContinueVisible] = useState(false);
  const [yesSelected, setYesSelected] = useState(false);
  const [noSelected, setNoSelected] = useState(false);
  const [isCurrentCipherCorrect, setIsCurrentCipherCorrect] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [roundType, setRoundType] = useState("practice"); // "practice", "game", or "grammarly"
  const [showInstructions, setShowInstructions] = useState(true);
  const [practiceAnswers, setPracticeAnswers] = useState([]);
  const [showPracticeIncomplete, setShowPracticeIncomplete] = useState(false);
  const [showCompletionScreen, setShowCompletionScreen] = useState(false);
  const [actualIncorrectIndices, setActualIncorrectIndices] = useState([]);

  useEffect(() => {
    // Fetching data from /data.json
    fetch("/data.json")
      .then((response) => response.json())
      .then((jsonData) => {
        // If grammarlyRounds is an object (with systematicIndices, accuracyRate and rounds), then set the global values
        if (
          jsonData.grammarlyRounds &&
          typeof jsonData.grammarlyRounds === "object" &&
          jsonData.grammarlyRounds.systematicIndices &&
          jsonData.grammarlyRounds.rounds
        ) {
          globalGrammarlySystematicIndices = jsonData.grammarlyRounds.systematicIndices; // Set global systematic indices
          // Set global accuracy rate if provided; otherwise, it will remain null
          if (jsonData.grammarlyRounds.accuracyRate !== undefined) {
            globalGrammarlyAccuracyRate = jsonData.grammarlyRounds.accuracyRate;
          }
          jsonData.grammarlyRounds = jsonData.grammarlyRounds.rounds; // use rounds array from the object
        }
        setData(jsonData);
        generateCipher(jsonData.practice[0]);
      })
      .catch((error) => console.error("Error loading JSON:", error));
  }, []);

  const generateCipher = (reference, previousAnswer = null) => {
    if (!reference) {
      console.error("generateCipher received an undefined reference!");
      return;
    }

    // If reference is an object, extract its text; otherwise, use it directly.
    const refText = typeof reference === "string" ? reference : reference.text;
    const rng = seedrandom(refText); // deterministic based on the reference text

    let encrypted, baseIncorrectIndices, chars, eligibleIndices;
    if (cipherCache[refText]) {
      encrypted = cipherCache[refText].encrypted;
      baseIncorrectIndices = cipherCache[refText].incorrectIndices;
      setCipherText(encrypted);
    } else {
      chars = refText.split("");
      eligibleIndices = chars.map((_, i) => i).filter((i) => /[a-zA-Z]/.test(chars[i]));
      const numToEncodeCorrectly = Math.floor(eligibleIndices.length / 2);
      const shuffledIndices = [...eligibleIndices].sort(() => rng() - 0.5);
      const correctIndicesSet = new Set(shuffledIndices.slice(0, numToEncodeCorrectly));
      baseIncorrectIndices = eligibleIndices.filter((i) => !correctIndicesSet.has(i));

      encrypted = chars
        .map((char, index) => {
          const lower = char.toLowerCase();
          const isAlpha = /[a-zA-Z]/.test(char);
          if (!isAlpha) return char;
          if (correctIndicesSet.has(index)) {
            return fixedCipherRule[lower] || char;
          } else {
            let randomChar;
            do {
              randomChar = String.fromCharCode(97 + Math.floor(rng() * 26));
            } while (randomChar === fixedCipherRule[lower] || randomChar === lower);
            return randomChar;
          }
        })
        .join("");

      cipherCache[refText] = {
        encrypted,
        incorrectIndices: baseIncorrectIndices,
      };
      setCipherText(encrypted);
    }

    // For all rounds, the cipher text generation is the same.
    // If it's a grammarly round, adjust the highlighted indices (actualIncorrectIndices)
    if (roundType === "grammarly") {
      if (!eligibleIndices) {
        // If eligibleIndices wasn't computed in the cached branch, compute it now
        chars = refText.split("");
        eligibleIndices = chars.map((_, i) => i).filter((i) => /[a-zA-Z]/.test(chars[i]));
      }
      // Use the global accuracy rate if provided, otherwise use a fallback default (0.5)
      const accuracyRate = globalGrammarlyAccuracyRate !== null ? globalGrammarlyAccuracyRate : 0.5;
      const totalHighlights = baseIncorrectIndices.length;
      const trueCount = Math.floor(totalHighlights * accuracyRate);
      const falseCount = totalHighlights - trueCount;
      const trueSuggestions = shuffleArray([...baseIncorrectIndices], rng).slice(0, trueCount);
      const falseCandidates = eligibleIndices.filter((i) => !baseIncorrectIndices.includes(i));
      const falseSuggestions = shuffleArray([...falseCandidates], rng).slice(0, falseCount);
      const suggestedIndices = [...trueSuggestions, ...falseSuggestions].sort((a, b) => a - b);

      // Additional rule: Use global systematic indices if they exist for all grammarly rounds.
      let additionalIndices = [];
      if (globalGrammarlySystematicIndices && Array.isArray(globalGrammarlySystematicIndices)) {
        additionalIndices = globalGrammarlySystematicIndices;
      } else {
        // Fallback to default rule: always highlight incorrectly ciphered occurrences of "e"
        const configuredLetter = "e"; // Change this value to highlight a different letter.
        for (let i = 0; i < refText.length; i++) {
          if (refText[i].toLowerCase() === configuredLetter.toLowerCase()) {
            const expected = fixedCipherRule[refText[i].toLowerCase()] || refText[i];
            if (encrypted[i] !== expected && !suggestedIndices.includes(i)) {
              additionalIndices.push(i);
            }
          }
        }
      }
      const finalSuggestedIndices = [
        ...new Set([...suggestedIndices, ...additionalIndices]),
      ].sort((a, b) => a - b);
      setActualIncorrectIndices(finalSuggestedIndices);
    } else {
      setActualIncorrectIndices(baseIncorrectIndices);
    }

    if (previousAnswer) {
      setUserThinksCorrect(previousAnswer.userThinksCorrect);
      setUserThinksCorrectExplicitlySet(true);
      setIncorrectIndices(previousAnswer.incorrectIndices || []);
      setContinueVisible(true);
      setYesSelected(previousAnswer.userThinksCorrect);
      setNoSelected(!previousAnswer.userThinksCorrect);
    } else {
      setUserThinksCorrect(false);
      setUserThinksCorrectExplicitlySet(false);
      setIncorrectIndices([]);
      setContinueVisible(false);
      setYesSelected(false);
      setNoSelected(false);
    }

    setIsCurrentCipherCorrect(false);
  };

  const handleLetterClick = (index) => {
    if (!userThinksCorrectExplicitlySet || userThinksCorrect) return;
    setIncorrectIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
    setContinueVisible(true);
  };

  const handleYesClick = () => {
    setUserThinksCorrect(true);
    setUserThinksCorrectExplicitlySet(true);
    setNoSelected(false);
    setYesSelected(true);
    setIncorrectIndices([]);
    setContinueVisible(true);
  };

  const handleNoClick = () => {
    setUserThinksCorrect(false);
    setUserThinksCorrectExplicitlySet(true);
    setYesSelected(false);
    setNoSelected(true);
    setContinueVisible(false);
  };

  const handleContinue = () => {
    if (!data) return;

    const sortedUser = [...incorrectIndices].sort((a, b) => a - b);
    const sortedActual = [...actualIncorrectIndices].sort((a, b) => a - b);
    const arraysEqual =
      sortedUser.length === sortedActual.length &&
      sortedUser.every((value, index) => value === sortedActual[index]);

    const isAnswerCorrect = !userThinksCorrect && arraysEqual;

    const updatedAnswers = [...practiceAnswers];
    updatedAnswers[round] = {
      isCorrect: isAnswerCorrect,
      userThinksCorrect: userThinksCorrect,
      incorrectIndices: [...incorrectIndices],
      plainText:
        roundType === "practice"
          ? data.practice[round]
          : roundType === "game"
          ? data.gameRounds[round]
          : data.grammarlyRounds[round],
      cipherText: cipherText,
      actualIncorrectIndices: [...actualIncorrectIndices],
    };
    setPracticeAnswers(updatedAnswers);

    if (roundType === "practice") {
      if (round < data.practice.length - 1) {
        // Proceed to the next practice round regardless of correctness
        setRound(round + 1);
        generateCipher(data.practice[round + 1], updatedAnswers[round + 1]);
      } else {
        // Final practice round: check if all answers are correct.
        const allCorrect = updatedAnswers.every((answer) => answer?.isCorrect);
        if (allCorrect) {
          setRoundType("game");
          setRound(0);
          generateCipher(data.gameRounds[0]);
        } else {
          setShowPracticeIncomplete(true);
        }
      }
    } else if (roundType === "game") {
      if (round < data.gameRounds.length - 1) {
        setRound(round + 1);
        generateCipher(data.gameRounds[round + 1]);
      } else {
        setRoundType("grammarly");
        setRound(0);
        generateCipher(data.grammarlyRounds[0]);
      }
    } else if (roundType === "grammarly") {
      if (round < data.grammarlyRounds.length - 1) {
        setRound(round + 1);
        generateCipher(data.grammarlyRounds[round + 1]);
      } else {
        setShowCompletionScreen(true);
      }
    }
  };

  if (!data) {
    return <p>Loading...</p>;
  }

  if (showCompletionScreen) {
    return (
      <div className="completion-screen">
        <h1 className="completion-title">🎉 Congratulations! 🎉</h1>
        <p className="completion-message">
          You have successfully completed all the practice and game rounds.
        </p>
        <button
          className="restart-btn"
          onClick={() => {
            setShowCompletionScreen(false);
            setRoundType("practice");
            setRound(0);
            setPracticeAnswers([]);
            generateCipher(data.practice[0]);
          }}
        >
          Play Again
        </button>
      </div>
    );
  }

  if (showInstructions) {
    return (
      <div className="instructions-screen">
        <h1 className="title">Cipher Instructions</h1>
        <div className="cipher-key-container">
          <h2 className="cipher-key-title">Cipher Key</h2>
          <p className="cipher-label">Plaintext Alphabet</p>
          <div className="cipher-box">
            <p>abcdefghijklmnopqrstuvwxyz</p>
          </div>
          <p className="cipher-label">Ciphertext Alphabet</p>
          <div className="cipher-box">
            <p>
              {"abcdefghijklmnopqrstuvwxyz"
                .split("")
                .map((char) => fixedCipherRule[char])
                .join("")}
            </p>
          </div>
        </div>
        <p className="instructions-text">
          This is the cipher for this task. Sentences and words will be encoded using these rules.
          For each sentence, exactly 50% of the letters will be correctly ciphered according to the above rule,
          and 50% will be incorrect. Your task is to identify the letters that are incorrectly ciphered or
          confirm if you believe the cipher is entirely correct.
        </p>
        <h3 className="task-title">Your Task:</h3>
        <ul className="task-list">
          <li>First select whether the example is correct or incorrect.</li>
          <li>
            After that, select where in the text there are letters out of place or use the text box to describe the error.
          </li>
        </ul>
        <button className="start-button" onClick={() => setShowInstructions(false)}>
          Begin Challenge
        </button>
      </div>
    );
  }

  if (showPracticeIncomplete) {
    return (
      <div className="summary-screen">
        <h1 className="summary-title">Practice Round Incomplete</h1>
        <p className="summary-box">You did not answer all the practice questions correctly</p>
        <button
          className="retry-btn"
          onClick={() => {
            setRound(0);
            setShowPracticeIncomplete(false);
            if (practiceAnswers[0]) {
              generateCipher(practiceAnswers[0].plainText, practiceAnswers[0]);
            }
          }}
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="cipher-game">
      <h1 className="title">
        {roundType === "practice"
          ? "Practice Task"
          : roundType === "game"
          ? "Game Round"
          : "Grammarly Round"}{" "}
        {round + 1}
      </h1>
      <p className="reference-text">
        <strong>Reference Text:</strong>{" "}
        {roundType === "practice"
          ? data.practice[round]
          : roundType === "game"
          ? data.gameRounds[round]
          : data.grammarlyRounds[round]}
      </p>

      {roundType === "grammarly" && (
        <p className="grammarly-note">
          Grammarly suggests that the highlighted letters may be incorrect
        </p>
      )}

      <h2 className="encoded-message-title">Encoded Message:</h2>
      <div className="cipher-container">
        {cipherText.split("").map((char, index) => {
          const isGrammarlySuggested =
            roundType === "grammarly" && actualIncorrectIndices.includes(index);
          const isUserMarkedError = incorrectIndices.includes(index);

          return (
            <span
              key={index}
              className={`cipher-letter ${isUserMarkedError ? "error" : ""} ${
                isGrammarlySuggested ? "grammarly-suggested" : ""
              }`}
              onClick={() => handleLetterClick(index)}
            >
              {char}
            </span>
          );
        })}
      </div>

      <h3 className="is-cipher-correct">Is this cipher correct?</h3>
      <div className="buttons">
        <button className={`yes-btn ${yesSelected ? "selected" : ""}`} onClick={handleYesClick}>
          Yes
        </button>
        <button className={`no-btn ${noSelected ? "selected" : ""}`} onClick={handleNoClick}>
          No
        </button>
      </div>

      {userThinksCorrectExplicitlySet && !userThinksCorrect && (
        <p className="guidance">🔎 Click on the incorrect letters in the cipher above</p>
      )}

      {continueVisible && (
        <button className="continue-btn" onClick={handleContinue}>
          Continue
        </button>
      )}

      <button className="show-rules-btn" onClick={() => setShowRules(true)}>
        📜 Show Cipher Rules
      </button>

      {showRules && (
        <div className="cipher-rules-modal">
          <h2 className="cipher-rules-title">Cipher Key</h2>
          <div className="cipher-mapping">
            {Object.keys(fixedCipherRule).map((char) => (
              <p key={char}>
                {char} → {fixedCipherRule[char]}
              </p>
            ))}
          </div>
          <button className="close-rules-btn" onClick={() => setShowRules(false)}>
            Close
          </button>
        </div>
      )}
    </div>
  );
};

export default CipherGame;