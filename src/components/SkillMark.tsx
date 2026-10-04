/** A is solid, B is an outline: the skill level without the words. */
export function SkillMark({ skill }: { skill: 'A' | 'B' }) {
  return (
    <span className={`skill skill--${skill}`} title={skill === 'A' ? 'Skill level A' : 'Skill level B'}>
      {skill}
    </span>
  );
}
