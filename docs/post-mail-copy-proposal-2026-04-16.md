# Post-Mail Copy Proposal (FR/EN/DE)

This file proposes copy updates only (no implementation yet).

## 1) Subject updates (remove "& Certificates")

- FR: `📢 Flyability / {{COMPANY_NAME}} Récapitulatif de formation + supports théoriques`
- EN: `📢 Flyability / {{COMPANY_NAME}} Training recap + training materials`
- DE: `📢 Flyability / {{COMPANY_NAME}} Schulungsrückblick + Schulungsunterlagen`

## 2) Reworked text after embedded links (all assets from the source mail)

Use these lines as the sentence directly after each linked asset.

### Asset: Introductory Training for Elios 3

- FR: `Cette présentation reprend les fondamentaux du jour 1: configuration, pilotage de base et prise en main opérationnelle de l'Elios 3.`
- EN: `This deck covers day-one essentials: setup, core flying, and operational basics for running Elios 3 missions confidently.`
- DE: `Diese Unterlage deckt die Grundlagen von Tag 1 ab: Setup, Basisflug und operativer Einstieg mit dem Elios 3.`

### Asset: AIIM Training for Elios 3

- FR: `Ce support détaille la méthode AIIM, de la préparation au post-traitement, pour structurer des inspections indoor efficaces et reproductibles.`
- EN: `This material details the AIIM method from planning to post-processing, helping your team run structured and repeatable indoor inspections.`
- DE: `Diese Unterlage beschreibt die AIIM-Methode von der Vorbereitung bis zur Nachbearbeitung für strukturierte und reproduzierbare Indoor-Inspektionen.`

### Asset: Method Statement Template

- FR: `Ce modèle vous aide à cadrer mission, périmètre et contraintes avant intervention afin d'aligner toutes les parties prenantes.`
- EN: `This template helps you define mission scope, constraints, and responsibilities before deployment so everyone starts aligned.`
- DE: `Diese Vorlage hilft euch, Auftrag, Rahmenbedingungen und Verantwortlichkeiten vor dem Einsatz klar festzulegen.`

### Asset: Risk Assessment Guide

- FR: `Ce guide permet d'évaluer le niveau de risque de chaque mission et de choisir les bonnes mesures de mitigation avant le vol.`
- EN: `This guide lets you assess mission risk level and define practical mitigation actions before entering the asset.`
- DE: `Mit diesem Leitfaden bewertet ihr das Missionsrisiko und legt vor dem Flug passende Minderungsmaßnahmen fest.`

### Asset: SOP (Standard Operating Procedure)

- FR: `Cette base SOP formalise les étapes clés avant, pendant et après inspection pour standardiser vos opérations sur le terrain.`
- EN: `This SOP baseline structures key pre-, during-, and post-inspection steps so operations stay consistent across teams.`
- DE: `Diese SOP-Grundlage strukturiert die zentralen Schritte vor, während und nach der Inspektion für konsistente Abläufe im Team.`

### Asset: Flyability Knowledge Base

- FR: `Votre point d'entrée principal pour le support produit, les notes firmware et les bonnes pratiques d'exploitation.`
- EN: `Your main entry point for product support, firmware guidance, and practical field troubleshooting.`
- DE: `Euer zentraler Einstieg für Produktsupport, Firmware-Hinweise und praxisnahes Troubleshooting im Feld.`

### Asset: Inspector 5

- FR: `Inspector 5 centralise les données capturées et facilite la revue visuelle avant partage interne ou livrable client.`
- EN: `Inspector 5 centralizes captured mission data and streamlines visual review before internal handoff or customer delivery.`
- DE: `Inspector 5 bündelt erfasste Einsatzdaten und vereinfacht die visuelle Auswertung vor interner Übergabe oder Kundendokumentation.`

### Asset: Nubigon

- FR: `Nubigon permet d'exploiter les nuages de points pour des revues visuelles avancées et des présentations orientées décision.`
- EN: `Nubigon helps you leverage point clouds for advanced visual reviews and decision-ready stakeholder presentations.`
- DE: `Mit Nubigon nutzt ihr Punktwolken für vertiefte visuelle Analysen und entscheidungsorientierte Präsentationen.`

### Asset: Scan to BIM Workflow

- FR: `Ce workflow décrit le passage de la donnée terrain vers une utilisation BIM exploitable par les équipes ingénierie.`
- EN: `This workflow explains how to move from field capture to BIM-ready outputs usable by engineering teams.`
- DE: `Dieser Workflow zeigt, wie ihr Felddaten in BIM-fähige Ergebnisse für Engineering-Teams überführt.`

### Asset: FARO Connect Training

- FR: `Ce diaporama couvre la chaîne complète FARO Connect, de l'import au nuage de points propre prêt pour exploitation.`
- EN: `This deck covers the full FARO Connect chain from import to clean point-cloud output ready for analysis.`
- DE: `Dieser Foliensatz behandelt die komplette FARO-Connect-Kette vom Import bis zur bereinigten, auswertbaren Punktwolke.`

### Asset: Flyability Academy

- FR: `La Flyability Academy donne accès à des modules sectoriels pour approfondir vos compétences au-delà de la formation initiale.`
- EN: `Flyability Academy gives access to industry-focused modules so your team can continue building skills after core training.`
- DE: `Die Flyability Academy bietet branchenspezifische Module, damit euer Team seine Fähigkeiten nach dem Basistraining weiter ausbauen kann.`

### Asset: High Capacity Battery Video Guide

- FR: `Cette vidéo présente l'usage, les limites et les bonnes pratiques des batteries grande capacité pour des vols plus longs et maîtrisés.`
- EN: `This guide explains handling, constraints, and best practices for high-capacity batteries to support longer, controlled flights.`
- DE: `Dieses Video zeigt Handhabung, Grenzen und Best Practices für High-Capacity-Akkus bei längeren, kontrollierten Flügen.`

### Asset: Tether Video Guide

- FR: `Cette vidéo détaille l'installation, l'utilisation en vol et la maintenance du tether pour des missions en alimentation continue.`
- EN: `This video details tether setup, in-flight use, and maintenance for missions requiring continuous power.`
- DE: `Dieses Video erläutert Aufbau, Einsatz im Flug und Wartung der Tether-Einheit für Missionen mit Dauerstrom.`

## 3) Additional assets — proposed EN / DE / FR

These assets exist in the post-mail link catalogue but were **not** in the original source-mail extract (§2). Confirm or edit the lines below; after your confirmation they will be implemented in `web/src/lib/change-options.ts`, `web/src/mail-config/useful-links-policy.json` (where applicable), and Thinkific-derived descriptions.

### Section intro: Training videos block (optional paragraph under `🎬` heading)

- EN: `Short walkthroughs on payloads, power options, and field accessories—ideal for pilots and site support before tether work or high-capacity battery operations.`
- DE: `Kurze Walkthroughs zu Payloads, Energieversorgung und Feldzubehör—für Piloten und Unterstützung vor Ort, insbesondere vor Tether-Einsätzen oder mit High-Capacity-Akkus.`
- FR: `Guides courts sur charges utiles, alimentation et accessoires de terrain—pour les pilotes et l'équipe terrain avant usage du tether ou batteries grande capacité.`

### Asset: YouTube Channel

- EN: `Curated Flyability playlists for payloads, inspections, and field workflows—quick video refreshers between missions without long manual reads.`
- DE: `Kuratierte Flyability-Playlists zu Payloads, Inspektionen und Feldworkflow—kurze Video-Auffrischer zwischen den Einsätzen statt langer Handbücher.`
- FR: `Playlists Flyability sur charges utiles, inspections et terrain—rappels vidéo courts entre missions sans relire de longs manuels.`

### Asset: Customer Toolkit

- EN: `Downloadable brand assets, brochures, datasheets, and sample datasets for polished customer-facing deliverables.`
- DE: `Herunterladbare Markenassets, Broschüren, Datenblätter und Beispieldatensätze für professionelle Kundenunterlagen.`
- FR: `Assets de marque, brochures, fiches techniques et jeux de données téléchargeables pour des livrables clients soignés.`

### Asset: Introductory UT training for Elios 3 — slide deck

- EN: `Covers Elios 3 UT hardware, pre-flight checks, and how A-scans support defect interpretation before your first ultrasonic inspections on site.`
- DE: `Elios-3-UT-Hardware, Preflight-Checks und A-Scan-Bezug zu Befunden—Grundlage vor den ersten UT-Inspektionen bei euch vor Ort.`
- FR: `Matériel UT Elios 3, vérifications et lecture A-scan pour l'interprétation des défauts avant les premières inspections ultrason sur site.`

### Asset: Advanced UT training for Elios 3 — slide deck

- EN: `Builds on the intro deck with scan plans, gating, and more demanding scenarios for complex UT geometry and tight access.`
- DE: `Baut auf dem Einführungsdeck auf: Scanpläne, Gates und anspruchsvollere Szenarien bei komplexer Geometrie oder engem Zugang.`
- FR: `Prolonge l'intro avec plans de balayage, gates et cas plus exigeants pour géométrie UT complexe ou accès restreint.`

### Asset: FARO Connect Online Course

- EN: `Self-paced FARO Connect modules with examples and quizzes across the full import-to-delivery workflow beyond what slides alone cover.`
- DE: `Selbststudium-Module mit Beispielen und Quizzes über den gesamten FARO-Connect-Workflow vom Import bis zur Auslieferung.`
- FR: `Modules à votre rythme, exemples et quiz sur tout le flux FARO Connect de l'import à la livraison, au-delà du seul diaporama.`

### Asset: Water & wastewater inspection training — slide deck

- EN: `Sector framing for pipes, wet wells, and treatment assets so the team shares one approach before wastewater inspection campaigns.`
- DE: `Branchenrahmen für Leitungen, Schächte und Kläranlagen—gemeinsame Linie vor Abwasser- und Versorger-Inspektionskampagnen.`
- FR: `Cadre eau et eaux usées pour conduites, regards et ouvrages de traitement—alignement d'équipe avant campagnes d'inspection réseau.`

### Asset: Cement plant & kiln inspection training — slide deck

- EN: `Kiln, cooler, and high-dust plant angles that go beyond generic indoor guidance for cement-site inspection briefings.`
- DE: `Ofen, Kühler und staubige Heißanlagen aus Zement-Sicht—über generische Indoor-Hinweise hinaus für Einsatzbriefings.`
- FR: `Fours, refroidisseurs et sites chauds poussiéreux vus ciment—au-delà du guidage indoor générique pour vos briefs terrain.`

### Asset: Wastewater Online Course (Academy)

- EN: `Academy path on access, inspection patterns, and reporting norms—a structured follow-on after the sector slide deck.`
- DE: `Academy-Pfad zu Zugang, Inspektionsmustern und Berichtsnormen—strukturierte Vertiefung nach dem Branchen-Foliensatz.`
- FR: `Parcours Academy sur accès, modes d'inspection et normes de rapport—suite structurée après le diaporama sectoriel.`

### Asset: Gas Sensor Quick Start Guide

- EN: `Mounting, pre-flight checks, and in-flight flammable-gas reading practice for this payload.`
- DE: `Montage, Preflight-Checks und brennbare Gaswerte im Flug für diesen Payload.`
- FR: `Montage, vérifications avant vol et lectures de gaz inflammables en vol pour cette charge utile.`

### Asset: Elios 3 RAD Sensor Training Video

- EN: `RAD flight behaviour, data cues, and Elios 3 field practices so acquisition expectations are clear before you fly.`
- DE: `RAD-Flugverhalten, Datenhinweise und Elios-3-Feldpraxis—klare Erwartungen an die Datenerfassung vor dem Flug.`
- FR: `Comportement RAD en vol, indices dans les données et pratiques Elios 3—attentes d'acquisition claires avant le vol.`

### Asset: Flyability Tent Folding Tutorial

- EN: `Step-by-step folding so the tent packs cleanly for transport after outdoor operations.`
- DE: `Schritt-für-Schritt-Falten, damit das Zelt sauber in die Tasche passt und transporttauglich bleibt.`
- FR: `Pliage pas à pas pour ranger la tente proprement dans son sac après interventions extérieures.`

### Asset: Flyability guide to UT probe selection — slide deck

- EN: `Probe types, couplant choice, and surface preparation so ultrasonic readings stay consistent on demanding surfaces.`
- DE: `Sondentypen, Koppelmittelwahl und Oberflächenvorbereitung für konsistente UT-Messungen auf anspruchsvollen Oberflächen.`
- FR: `Types de sondes, choix du couplant et préparation de surface pour des mesures UT stables sur surfaces exigeantes.`

### Thinkific / Academy course: Regulation Course (`thinkific_regulation`)

- EN: `Regulation-focused modules on approvals, airspace, and UAS compliance basics beyond what fits in classroom time.`
- DE: `Regulatorik-Module zu Genehmigungen, Luftraum und UAS-Compliance-Grundlagen—über den klassischen Schulungsumfang hinaus.`
- FR: `Modules réglementation : autorisations, espace aérien et bases conformité UAS—au-delà du temps de cours classique.`

### Thinkific / Academy course: Gas Sensor Course (`thinkific_gas_sensor`)

- EN: `Academy modules on gas-sensor setup, monitoring, and safe interpretation of flammable trends for regulated or confined operations.`
- DE: `Academy-Module zu Gas-Sensor-Setup, Monitoring und sicherer Einordnung brennbarer Trends für regulierte oder begrenzte Einsätze.`
- FR: `Modules Academy sur installation, suivi et lecture sûre des tendances inflammables pour opérations réglementées ou confinées.`

### Thinkific / Academy course: Cement Industry Course (`thinkific_cement`)

- EN: `Online cement modules for kilns, coolers, and Elios flight paths in dusty, high-heat plants—structured depth after the sector slide deck.`
- DE: `Online-Zement-Module für Ofen, Kühler und Elios-Flugpfade in staubigen Heißanlagen—strukturierte Vertiefung nach dem Branchen-Foliensatz.`
- FR: `Modules ciment en ligne pour fours, refroidisseurs et parcours Elios sous chaleur et poussière—approfondissement après le diaporama sectoriel.`

### Thinkific / Academy course: Mining Industry Course (`thinkific_mining`)

- EN: `Underground mining modules on headings, ground support, and Elios flight tactics for teams that routinely work in cave or drift environments.`
- DE: `Untertage-Bergbau-Module zu Ortsbrüsten, Gebirgssicherung und Elios-Flugtaktik für Teams in Stollen- und Streckenroutine.`
- FR: `Modules mines souterraines : galeries, soutènements et tactiques de vol Elios pour équipes en travail de galerie courant.`

### Thinkific / Academy course: Wastewater Course (`thinkific_wastewater`)

- EN: `Wastewater Academy modules on sewers, treatment assets, access, and reporting norms—paced lessons alongside the sector slide deck.`
- DE: `Academy-Abwasser-Module zu Kanälen, Anlagen, Zugang und Berichtsnormen—strukturierte Lektionen ergänzend zum Branchen-Foliensatz.`
- FR: `Modules Academy eaux usées : réseaux, ouvrages, accès et normes de rapport—leçons structurées en complément du diaporama sectoriel.`

### Thinkific / Academy course: FARO Connect Online Course (`thinkific_faro_connect`)

- EN: `Hands-on FARO Connect drills on Elios exports from import through delivery for your daily processing workflow.`
- DE: `Praxisnahe FARO-Connect-Übungen an Elios-Exporten vom Import bis zur Auslieferung für den täglichen Verarbeitungsworkflow.`
- FR: `Exercices FARO Connect sur exports Elios de l'import à la livraison pour votre flux de traitement quotidien.`

### Thinkific / Academy — default blurb (any other Thinkific-linked course id)

- EN: `Industry-focused Academy modules beyond core Elios pilot training when a single vertical dominates your inspection work.`
- DE: `Branchenfokussierte Academy-Module jenseits der Elios-Grundausbildung, wenn eine Domäne eure Inspektionsarbeit prägt.`
- FR: `Modules Academy sectoriels au-delà du socle pilote Elios lorsqu'un vertical structure votre activité d'inspection.`

### Industry auto-block links (optional — today the email shows label + URL only)

If you later want one sentence after each auto-inferred industry link, use:

**Regulation** — EN: `Thinkific regulation track for approvals, airspace, and compliance basics.` DE: `Thinkific-Regulatorik-Track zu Genehmigungen, Luftraum und Compliance-Grundlagen.` FR: `Parcours Thinkific réglementation : autorisations, espace aérien et bases conformité.`

**Gas sensor** — EN: `Thinkific gas-sensor track for setup, monitoring, and safe flammable-gas interpretation.` DE: `Thinkific-Gas-Sensor-Track zu Setup, Monitoring und sicherer Einordnung brennbarer Gase.` FR: `Parcours Thinkific capteur gaz : installation, suivi et lecture sûre des gaz inflammables.`

**Cement** — EN: `Thinkific cement track for hot, dusty plant inspection context with Elios.` DE: `Thinkific-Zement-Track für heiße, staubige Anlagenkontexte mit Elios.` FR: `Parcours Thinkific ciment pour contexte Elios en milieu chaud et poussiéreux.`

**Mining** — EN: `Thinkific mining track for underground headings, support, and Elios tactics.` DE: `Thinkific-Bergbau-Track für unterirdische Strecken, Sicherung und Elios-Taktik.` FR: `Parcours Thinkific mines : galeries, soutènement et tactiques Elios souterrain.`

**Wastewater** — EN: `Thinkific wastewater track for networks, assets, access, and reporting norms.` DE: `Thinkific-Abwasser-Track für Netze, Anlagen, Zugang und Berichtsnormen.` FR: `Parcours Thinkific eaux usées : réseaux, ouvrages, accès et normes de rapport.`

**FARO Connect** — EN: `Thinkific FARO Connect track from Elios import through delivery.` DE: `Thinkific-FARO-Connect-Track von Elios-Import bis Auslieferung.` FR: `Parcours Thinkific FARO Connect des imports Elios à la livraison.`

## 4) Notes for implementation pass

- Keep section emojis and order identical to the source layout.
- Keep `➡️` lead-in style on each linked asset.
- Apply this copy only to post-training templates (`post_en`, `post_de`, `post_fr`).
- After you confirm §3, wire the same strings into code (and add industry-link descriptions only if you want the optional auto-block sentences).
