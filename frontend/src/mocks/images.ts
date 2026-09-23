// Free Unsplash photos (images.unsplash.com, Unsplash License)
const u = (id: string, w = 1200) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=75`

export const images = {
  heroSpeaker: u('photo-1715610258704-e8f9f5710fe0', 1400),
  podium: u('photo-1715610237622-748477adf2e4'),
  speakerCrowd: u('photo-1544531586-fde5298cdd40'),
  studentsHall: u('photo-1758270704763-22072a90d3b6'),
  studentsLaugh: u('photo-1522202176988-66273c2fd55f'),
  studentsLaptop: u('photo-1758270705518-b61b40527e76'),
  teamTable: u('photo-1530099486328-e021101a494a'),
  audience: u('photo-1540575467063-178a50c2df87'),
  stageAudience: u('photo-1587825140708-dfaf72ae4b04'),
  panel: u('photo-1582192730841-2a682d7375f9'),
  handsUp: u('photo-1550305080-4e029753abcf'),
  handsUp2: u('photo-1477281765962-ef34e8bb0967'),
  schoolGirls: u('photo-1753175843003-a7492d611bf9'),
  studentsBench: u('photo-1517486808906-6ca8b3f04846'),
  trophy: u('photo-1578269174936-2709b6aeb913'),
  microphone: u('photo-1475721027785-f74eccf877e2'),
  presentation: u('photo-1733222814719-9c756a54ad92'),
  conference: u('photo-1531058020387-3be344556be6'),
}

