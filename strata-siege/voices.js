'use strict';
/* Strata Siege: the voices of the garden.
   Data only. The game picks one line at random from an array when the event happens.
   barks: speech bubbles over enemies (max 28 chars). boss: boss lines (max 60).
   grandma (max 40), boot (max 24), hamsters (max 30), towers (max 30).
   gazette: Garden Gazette headlines after a level. `when` is a JS expression over `s`
   (level, leaks, hearts, kills, stomps, swats, built, digs, loot, hazards, boltKills,
   combos, early, boss, flawless, coins). {field} in `text` is replaced by s[field]. */
(function () {
  window.SS_VOICES = {
    barks: {
      rat: {
        spawn: ['Cheese, ho!', 'Is this the castle?', 'Back of the queue, Derek.', 'I smell biscuits.', 'Right. Who has the map?', 'Tally ho, lads!'],
        hurt: ['Ow, my whiskers!', 'That was a pea!', 'Not the tail!', 'Rude!', 'I bruise easily.', 'Ow. Ow. Owch.'],
        slow: ['My fur is soggy.', 'Brr. Damp feet.', 'I am a rat sorbet.', 'Nobody said rain.', 'Is this a lolly?'],
        stomped: ['Squeak.', 'Tell Mum I tried.', 'Flat as a crumpet.', 'Not the Boot!', 'I see stars. And laces.'],
        leak: ['Biscuit tin located!', 'Hello, Grandma!', 'I wiped my feet!', 'Is that a custard cream?', 'Made it! Now what?'],
      },
      snail: {
        spawn: ['Here I go.', 'Slowly does it.', 'Brought my house.', 'Started on Tuesday.', 'Do not wait up.'],
        hurt: ['Ow. Eventually.', 'Mind the shell!', 'I felt that next week.', 'My lovely spiral!', 'Rude. Slowly rude.'],
        slow: ['Slower? Bold.', 'Is time stopping?', 'Lovely drizzle, ta.', 'I was already slow.', 'Frozen. Same speed.'],
        stomped: ['Crunch.', 'Never even saw it.', 'I had plans. Slow ones.', 'My poor house!', 'Mortgage cleared.'],
        leak: ['Arrived. Finally.', 'Was that the door?', 'Took me a fortnight.', 'Kettle on, is it?', 'Told you I would.'],
      },
      beetle: {
        spawn: ['Shell polished.', 'Armour on. Chin up.', 'Clank clank clank.', 'Tank, reporting.', 'Shields up, chaps.'],
        hurt: ['Barely a dent.', 'That will buff out.', 'Ding!', 'My paintwork!', 'Was that a pea? Ha.'],
        slow: ['Rust! Rust!', 'My hinges seize.', 'Shell full of rain.', 'Iced beetle. Hmm.', 'Gears gone stiff.'],
        stomped: ['Crumple zone.', 'Not under warranty.', 'Upside down again.', 'Clunk.', 'Shell, meet sole.'],
        leak: ['Clanked right in.', 'Armour held!', 'Mind the carpet.', 'Delivery for Grandma.', 'Tank has landed.'],
      },
      hedgehog: {
        spawn: ['Mind the spikes.', 'Hug? No? Fair.', 'Spines combed.', 'Off for a stroll.', 'Snuffle snuffle.'],
        hurt: ['Prickly, now.', 'That stung. Me!', 'Ow, my quills!', 'You will regret it.', 'Not the face!'],
        slow: ['Soggy spikes.', 'Frosty quills.', 'I need a hot bath.', 'Drip drip drip.', 'Hedgehog lolly.'],
        stomped: ['Sorry about the sole.', 'Point taken.', 'Ouch. For you.', 'Pincushioned.', 'Fwump.'],
        leak: ['Coming through. Ow.', 'Spikes on the sofa!', 'Do not sit there.', 'Rolled right in.', 'Doormat ruined.'],
        special: ['Ball mode!', 'Nobody home.', 'Curled. Do not knock.', 'Spiky ball, rolling.', 'Not in, try later.'],
      },
      frog: {
        spawn: ['Ribbit, chaps.', 'Boing reporting.', 'Legs warmed up.', 'Pond to castle!', 'Hop it, everyone.'],
        hurt: ['Croak!', 'My lovely legs!', 'Bad hop day.', 'Rude ribbit.', 'Splat. Partly.'],
        slow: ['Ooh, rain. Lovely.', 'Too cold to boing.', 'Frog ice lolly.', 'Pond weather!', 'Legs gone numb.'],
        stomped: ['Mistimed it.', 'Should have hopped.', 'Croa...', 'Flat frog. Sad.', 'Hop went wrong.'],
        leak: ['Leapt the doormat!', 'Ribbit, Grandma!', 'In the teapot!', 'Kitchen sink? Pond!', 'Boing. Inside.'],
        special: ['Boing!', 'Up I go!', 'Missed me, Boot!', 'Air time!', 'Wheee!', 'Too high, Bootsy.'],
      },
      sapper: {
        spawn: ['Helmet on.', 'Going under.', 'Tunnelling, sir!', 'Dig dig dig.', 'Lamp lit. Off we go.'],
        hurt: ['Ow, the helmet!', 'Earth in my eye!', 'Not the shovel!', 'Rude tapping!', 'Mole down, nearly.'],
        slow: ['Mud. Thick mud.', 'Tunnel flooded!', 'Frosty soil. Ugh.', 'Shovel froze.', 'Damp work, this.'],
        stomped: ['Wrong hole.', 'Should have dug.', 'Daylight was a mistake.', 'Squish. Professionally.', 'Mole flat.'],
        leak: ['Under the floor!', 'Popped up in the pantry!', 'Tunnel complete!', 'Surprise, Grandma!', 'Mind the hole.'],
        special: ['Below decks.', 'You cannot see me.', 'Dig dig dig dig.', 'Lovely dark.', 'Burrowing...'],
      },
      balloon: {
        spawn: ['Up, up and away!', 'Air rat, aloft!', 'Lovely view up here.', 'Mind the string.', 'Wind behind me!'],
        hurt: ['A puncture?!', 'Hissss.', 'Losing altitude!', 'Not the balloon!', 'Mayday, mayday!'],
        slow: ['Soggy basket.', 'Balloon full of rain.', 'Frost on the string!', 'Drifting. Badly.', 'Cloud ate me.'],
        stomped: ['How did it reach?', 'Long leg, that Boot.', 'Grounded.', 'Pop. Squish.', 'Flight cancelled.'],
        leak: ['Landed on the roof!', 'Air mail, Grandma!', 'Chimney arrival!', 'Touchdown!', 'Parked by the gutter.'],
        special: ['POP!', 'Going dowwwn!', 'Parachute? No.', 'Brace, brace!', 'Walking from here.'],
      },
      duck: {
        spawn: ['Quack. Formally.', 'V formation, go!', 'Bread run.', 'Flappy flappy.', 'Wing it, lads.'],
        hurt: ['Quack! Ow!', 'Feathers! Mine!', 'Mind the beak.', 'Fowl play!', 'Ruffled.'],
        slow: ['Ah. Duck weather.', 'Lovely. Wet. Quack.', 'Iced wings!', 'Quack. Brr.', 'Back off, frost.'],
        stomped: ['Up a bit high, that.', 'Quaaack.', 'Down. Like a duvet.', 'Flat feathers.', 'Grounded, fowl.'],
        leak: ['Quack in the hall!', 'Through the window!', 'In the bath! Ideal.', 'Bread, please.', 'Landed, quack.'],
      },
      worm: {
        spawn: ['Woken. Grumpy.', 'Nest emptied!', 'Wriggle out!', 'Who dug the roof?', 'We are many. Long.'],
        hurt: ['Ow! Both ends!', 'My middle!', 'Was that a hamster?', 'Wiggle wounded.', 'Not the head. Or tail.'],
        slow: ['Rain! Party!', 'Ooh, lovely damp.', 'Too cold to wiggle.', 'Frozen spaghetti.', 'Puddle time.'],
        stomped: ['Two worms now.', 'Squelch.', 'Not my best wiggle.', 'Flat noodle.', 'Earthed.'],
        leak: ['Up the plughole!', 'Wriggled in!', 'Carpet is soft.', 'Grandma, hi!', 'In the slippers.'],
      },
      chick: {
        spawn: ['Peep!', 'Hatched! Hello!', 'Where is Mum?', 'Is this outside?', 'Peep peep peep!'],
        hurt: ['Peep! Ow!', 'Fluff damage!', 'I am only small!', 'Muuum!', 'Eep!'],
        slow: ['Cold fluff.', 'Peep. Brr.', 'Wet chick. Sad.', 'Shivery peep.', 'Want my shell back.'],
        stomped: ['Peep.', 'Fluffed it.', 'Pip.', 'Back to the egg.', 'Eep.'],
        leak: ['Peep! Grandma!', 'Found a warm bit!', 'Under the sofa!', 'Is this a nest?', 'Peep peep inside!'],
      },
      king: {
        spawn: ['Kneel, garden!', 'The crown arrives.', 'Royal procession!', 'Make way, peasants.', 'I am hereditary.'],
        hurt: ['Treason!', 'Off with your peas!', 'My robes!', 'Guards! Any guards?', 'Most unroyal.'],
        slow: ['My ermine is damp.', 'Who ordered snow?', 'A frosty reign.', 'Sceptre slipping.', 'Royal drizzle.'],
        stomped: ['Long live... me?', 'Abdication!', 'Crown slipped.', 'Not the royal nose!', 'A flat monarch.'],
        leak: ['My new palace!', 'Throne room, ho!', 'I claim this pantry.', 'Grandma, curtsey!', 'Annexed!'],
        special: ['I split, I rule!', 'Two kings now!', 'Heirs, assemble!', 'Divide and reign!', 'Smaller, still royal.'],
      },
      hen: {
        spawn: ['BAWK.', 'Where is my egg?', 'Who touched my eggs?', 'Mother is here.', 'Cluck. Seriously.'],
        hurt: ['Bawk! Rude!', 'Mind my feathers!', 'I have children!', 'I shall tell!', 'Cluck off.'],
        slow: ['Wet hen. Cross hen.', 'Frosty feathers!', 'I am getting crosser.', 'Brr. Bawk.', 'Not the perm!'],
        stomped: ['Bawk...', 'My poor chicks.', 'Feathers everywhere.', 'Egg-sasperating.', 'Cluck. Done.'],
        leak: ['Roosting here now.', 'Nest in the pantry!', 'Grandma, my eggs!', 'Henhouse acquired.', 'BAWK. Home.'],
        special: ['Egg!', 'Hatch, darlings!', 'Plop.', 'Another one!', 'Bawk. Egg laid.'],
      },
      tyrant: {
        spawn: ['The ground is MINE.', 'Rumble rumble.', 'Tunnels, open!', 'Bow, topsoil.', 'I dig. You weep.'],
        hurt: ['Insolent pea!', 'My claws!', 'You scratched my crown!', 'Ow, but grandly.', 'How dare.'],
        slow: ['Mud in my moat.', 'Frost in my tunnels!', 'Damp tyranny.', 'Squelch. Grr.', 'Cold claws.'],
        stomped: ['Topsoil wins.', 'Undermined.', 'Buried. Ironic.', 'Not like this.', 'Daylight. Ugh.'],
        leak: ['Up through the floor!', 'Your cellar is mine.', 'Tunnel to the tea!', 'Surprise basement!', 'Dug in.'],
        special: ['Diving!', 'Below you now.', 'Down I go!', 'Tap all you like.', 'Underneath. Always.'],
      },
      goose: {
        spawn: ['HONK.', 'Thunder honks.', 'Wings of doom.', 'Fear the bill.', 'The sky is mine.'],
        hurt: ['HONK! OW!', 'Feather loss!', 'You will be honked.', 'Insult to the flock!', 'Hiss.'],
        slow: ['I AM the weather.', 'Brr. HONK.', 'Wet goose. Worse.', 'Frosty honk.', 'Rain? Ha.'],
        stomped: ['Hooonk.', 'How. I fly.', 'Grounded. Nooo.', 'Webbed feet up.', 'Honk. Flat.'],
        leak: ['HONK. In the hall.', 'Nesting on the TV.', 'Grandma, hiss!', 'Goose in residence.', 'Honk. Mine now.'],
        special: ['Egg bomb!', 'Honk! Egg!', 'Drop it!', 'Catch, little ones!', 'Plop. HONK.'],
      },
    },

    boss: {
      hen: {
        title: 'Her Clucking Majesty, Mother of Many',
        intro: [
          'Somebody has been counting my eggs. Wrongly.',
          'I am Mama Hen. I have come for a word with the manager.',
          'Bawk. That is my polite voice. Enjoy it while it lasts.',
        ],
        half: [
          'You have ruffled me. Nobody ruffles me twice.',
          'Children! Mother is having a difficult conversation!',
          'I have laid eggs tougher than your towers.',
        ],
        defeat: [
          'Fine. I shall go home and sit on something.',
          'Bawk. Tell the chicks I was magnificent.',
          'I will write to your council. In feathers.',
        ],
      },
      tyrant: {
        title: 'His Subterranean Highness, Lord of Below',
        intro: [
          'I am the Tunnel Tyrant. Every lawn is my ceiling.',
          'You have been walking on my roof. Without asking.',
          'Hamsters. I have heard of you. I have heard you squeak.',
        ],
        half: [
          'Enough. I am going under. You may tap the soil.',
          'I have tunnels you have never even dreamt of.',
          'You dented my crown. It was a family heirloom.',
        ],
        defeat: [
          'Undone by a thumb and some hamsters. The shame.',
          'I shall return. Not soon. Very slowly. Through clay.',
          'Fine. Keep your lawn. I never liked the drainage.',
        ],
      },
      goose: {
        title: 'The Most Honkable Lord of Weather',
        intro: [
          'HONK. I am the Thunder Goose. The sky is my pond.',
          'Your clouds answer to me now. Mostly. HONK.',
          'I have come for the bread. And then the castle.',
        ],
        half: [
          'You dare use my own lightning on me? HONK.',
          'My feathers are frizzed. This is personal now.',
          'Eggs away! Let the little ones handle this.',
        ],
        defeat: [
          'Honk. That one was a sad honk.',
          'I shall fly south. Further south. Much further.',
          'Keep the weather. It was always a bit damp anyway.',
        ],
      },
    },

    grandma: {
      swat: [
        'No hawkers, thank you.',
        'We do not buy at the door.',
        'Mind the step, dear. Too late.',
        'Wipe your feet. Off you go.',
        'That is for ringing twice.',
      ],
      kettle: [
        'Kettle is on. Nobody move.',
        'I shall be pouring shortly. Hot.',
        'One lump or a scalding?',
        'Tea is served. Mind the spout.',
        'Milk first? No. Boiling first.',
      ],
      idle: [
        'I am knitting you a warning.',
        'Lovely day for a siege.',
        'I have counted the biscuits. Twice.',
        'My pin is getting restless.',
        'Do sit down, dear. I insist.',
      ],
      bossArrives: [
        'Oh, a big one. Fetch my good pin.',
        'Shoes off, whoever you are.',
        'I have dealt with worse at bingo.',
        'Large, is it? I shall be gentle-ish.',
        'Visiting hours are over, love.',
      ],
      lastHeart: [
        'Now I am cross. Politely cross.',
        'One more and I take my glasses off.',
        'I have written your names down.',
        'Last biscuit. Nobody touch it.',
        'This is my calm voice. Note it.',
      ],
      win: [
        'Lovely. Who wants a scone?',
        'Back to my crossword, then.',
        'Well done, dear. I barely tried.',
        'Tidy up, everyone. Tea in five.',
        'Same time next week, vermin.',
      ],
    },

    boot: [
      'STOMP.',
      'KER-THUMP.',
      'SQUELCH.',
      '(laces tighten)',
      '(hovers ominously)',
      'THOOM.',
      '(polishes itself)',
      'FLOMP.',
      '(tongue wags, meaning)',
      '(scrapes heel on grass)',
    ],

    hamsters: {
      dig: [
        'Union rates apply.',
        'Dig dig, cheek full.',
        'This dirt is non-union.',
        'Shift starts now. Paws ready.',
        'Mind your backs, lads!',
      ],
      loot: [
        'Shiny! Cheek it!',
        'One for the strike fund.',
        'Treasure, lads! Sort of.',
        'Pack it carefully. Gently!',
        'Bonus territory, this.',
      ],
      hazard: [
        'Health and safety!',
        'That is a grievance, that.',
        'Tools down! Tools down!',
        'Not in the contract!',
        'Somebody fetch the rep!',
      ],
      cheer: [
        'Motion carried!',
        'Solidarity, lads!',
        'All in favour! Squeak!',
        'A win for the workers!',
        'Seeds all round!',
      ],
      idle: [
        'Tea break. Statutory.',
        'Waiting on management.',
        'Wheel time, is it?',
        'We are on the clock, mind.',
        'Minutes of last meeting...',
      ],
      strike: [
        'Fair seeds for fair digs!',
        'Bigger backpacks now!',
        'What do we want? Naps!',
        'One out, all out!',
        'No pay, no pickaxe!',
      ],
    },

    towers: {
      pea: ['Locked and podded.', 'Peas be with you.', 'Shelling out.', 'Give peas a chance.'],
      kite: ['Strings attached.', 'Aloft and aloof.', 'Up, up and a pay.', 'Wind? Lovely. Fire.'],
      ice: ['Chill. Please.', 'Two scoops of nope.', 'Ow, my brain. Yours too.', 'Sprinkles on standby.'],
      banana: ['Peel of approval.', 'Slip service.', 'Going bananas.', 'Mind the floor. Ha.'],
      mortar: ['Brewing. Aiming.', 'Tea time. Duck.', 'Steeped in violence.', 'I am a little teapot.'],
      tesla: ['Lightly toasted.', 'Crumbs. Sparks.', 'Pop-up defence!', 'Setting: very done.'],
    },

    gazette: [
      // Flawless and hearts
      { when: 's.flawless', text: 'CASTLE DOORMAT UNSOILED FOR ENTIRE LEVEL' },
      { when: 's.flawless && s.level >= 10', text: 'LEVEL {level} SIEGE "A DODDLE", SAYS UNBOTHERED GRANDMA' },
      { when: 's.flawless && s.boss', text: '{boss} LEAVES WITHOUT EVEN RINGING THE BELL' },
      { when: 's.hearts === 1', text: 'CASTLE HANGING BY ONE HEART AND A HINGE' },
      { when: 's.hearts <= 2 && s.hearts > 0', text: 'GRANDMA "PERFECTLY FINE", SAYS CASTLE, SWEATING' },
      { when: 's.leaks >= 6', text: '{leaks} VERMIN ENTER CASTLE; DOOR CALLED "DECORATIVE"' },
      { when: 's.leaks >= 3 && s.leaks < 6', text: 'PANTRY RAIDED {leaks} TIMES; BISCUIT TIN "SHAKEN"' },
      { when: 's.leaks === 1', text: 'ONE RAT GETS IN, REFUSES TO LEAVE, ASKS FOR CUSHION' },
      // Kills
      { when: 's.kills >= 120', text: '{kills} VERMIN BOUNCED IN ONE LEVEL; RATS SEEK NEW GARDEN' },
      { when: 's.kills >= 60 && s.kills < 120', text: 'LOCAL GARDEN SEES OFF {kills} UNINVITED GUESTS' },
      { when: 's.kills < 15', text: 'QUIET DAY ON LAWN: ONLY {kills} VERMIN TURNED AWAY' },
      // Boot
      { when: 's.stomps === 0', text: 'BOOT TAKES DAY OFF, SPOTTED READING IN SHED' },
      { when: 's.stomps >= 40', text: 'BOOT STOMPS {stomps} TIMES, DEMANDS NEW SOLE' },
      { when: 's.stomps >= 15 && s.stomps < 40', text: 'LAWN NOW "MOSTLY FOOTPRINTS", SAYS WORM' },
      // Grandma
      { when: 's.swats === 0', text: 'GRANDMA\'S ROLLING PIN UNUSED; PASTRY FINALLY MADE' },
      { when: 's.swats >= 10', text: 'GRANDMA ANSWERS DOOR {swats} TIMES, NONE OF THEM KINDLY' },
      { when: 's.swats >= 4 && s.swats < 10', text: 'ROLLING PIN NAMED VOLUNTEER OF THE MONTH' },
      // Towers
      { when: 's.built === 0', text: 'NOT ONE TOWER BUILT; COUNCIL PRAISES "OPEN PLAN" LAWN' },
      { when: 's.built === 0 && s.flawless', text: 'GARDEN WINS WITHOUT TOWERS; TOWERS DEMAND EXPLANATION' },
      { when: 's.built >= 12', text: '{built} TOWERS GO UP; LAWN APPLIES FOR CITY STATUS' },
      { when: 's.built >= 1 && s.built <= 3', text: 'PLANNING OFFICE BAFFLED BY ONLY {built} TOWERS' },
      // Digging
      { when: 's.digs === 0', text: 'HAMSTERS PAID TO PLAY CARDS; UNION "DELIGHTED"' },
      { when: 's.digs >= 30', text: 'HAMSTERS DIG {digs} TILES; GARDEN NOW "MOSTLY HOLE"' },
      { when: 's.loot >= 25', text: 'HAMSTERS BANK {loot} GEMS, BUY TINY YACHT' },
      { when: 's.loot >= 10 && s.loot < 25', text: 'GEM RUSH UNDER FLOWERBED: {loot} BROUGHT HOME' },
      { when: 's.digs >= 10 && s.loot === 0', text: '{digs} TILES DUG FOR NOTHING; HAMSTERS "PHILOSOPHICAL"' },
      { when: 's.hazards === 0 && s.digs >= 10', text: 'SPOTLESS SAFETY RECORD BELOW; HAMSTER REP SUSPICIOUS' },
      { when: 's.hazards >= 5', text: '{hazards} HAZARDS UNEARTHED; HAMSTERS FORM COMMITTEE' },
      { when: 's.hazards >= 2 && s.hazards < 5', text: 'STINK, WORMS AND RUBBLE: A NORMAL DAY DOWNSTAIRS' },
      // Sky
      { when: 's.boltKills >= 15', text: 'LIGHTNING CLAIMS {boltKills}; CLOUDS ASK FOR PAY RISE' },
      { when: 's.boltKills >= 5 && s.boltKills < 15', text: 'STORM CLOUD "ONLY DOING ITS JOB", SAYS STORM CLOUD' },
      { when: 's.boltKills === 0 && s.level >= 6', text: 'SKY REPORTS NO STRIKES; THUNDER FEELS UNDERVALUED' },
      // Combos and pace
      { when: 's.combos >= 5', text: '{combos} STRATA COMBOS; MYSTERY THUMB "EVERYWHERE AT ONCE"' },
      { when: 's.combos >= 1 && s.combos < 5', text: 'THUMB SEEN ON ALL THREE LAYERS; GNOME DIZZY' },
      { when: 's.early >= 5', text: 'WAVES CALLED EARLY {early} TIMES; RATS HAD NOT EVEN PACKED' },
      { when: 's.early === 0 && s.level >= 3', text: 'PLAYER WAITS FOR EVERY WAVE; SNAILS APPLAUD' },
      // Money
      { when: 's.coins >= 500', text: 'CASTLE SITTING ON {coins} COINS; MOLES TAKE NOTES' },
      { when: 's.coins < 20', text: 'GARDEN DOWN TO {coins} COINS; GNOME "NOT SURPRISED"' },
      // Bosses
      { when: 's.boss === "Mama Hen"', text: 'MAMA HEN SENT PACKING; EGGS "UNDER REVIEW"' },
      { when: 's.boss === "The Tunnel Tyrant"', text: 'TUNNEL TYRANT DEPOSED; LAWN DRAINAGE IMPROVES' },
      { when: 's.boss === "The Thunder Goose"', text: 'THUNDER GOOSE GROUNDED; WEATHER RETURNS TO NORMAL DRIZZLE' },
      { when: 's.boss && s.leaks >= 3', text: '{boss} DEFEATED, BUT NOT BEFORE USING THE LOO' },
      // Level milestones
      { when: 's.level === 1', text: 'FIRST SIEGE OF SEASON GOES AHEAD DESPITE WEATHER' },
      { when: 's.level >= 30', text: 'LEVEL {level}: GARDEN "FRANKLY STILL GOING", SAYS GNOME' },
      { when: 's.level % 5 === 0', text: 'LEVEL {level} MILESTONE MARKED WITH SLIGHTLY NICER BISCUIT' },
      // Combinations
      { when: 's.stomps === 0 && s.swats === 0', text: 'BOOT AND GRANDMA BOTH OFF SICK; TOWERS COPE' },
      { when: 's.built >= 8 && s.leaks >= 4', text: '{built} TOWERS, {leaks} LEAKS: INQUIRY OPENS' },
      { when: 's.stomps > s.kills && s.kills > 0', text: 'BOOT STOMPS MORE THAN IT HITS; LAWN FILES COMPLAINT' },
      // Generic
      { when: 'true', text: 'SIEGE CONTINUES; GNOME STILL HAS NOT MOVED' },
      { when: 'true', text: 'WEATHER: CLOUDY WITH A CHANCE OF RATS' },
      { when: 'true', text: 'LETTERS: "WHOSE BOOT IS IT?" ASKS READER, AGAIN' },
      { when: 'true', text: 'SNAIL REACHES HALFWAY POINT OF LAST WEEK\'S LEVEL' },
      { when: 'true', text: 'GRANDMA\'S SCONES "SUSPICIOUSLY HEAVY", REPORTS MOLE' },
      { when: 'true', text: 'HAMSTER UNION AGM ENDS IN NAP' },
    ],
  };
})();
