-- Labels seeded by an earlier build of 0005 stored palette names; map them to the same hex values.
UPDATE `task_labels` SET `color` = CASE `color`
  WHEN 'red' THEN '#e5484d'
  WHEN 'orange' THEN '#f76b15'
  WHEN 'yellow' THEN '#d4a017'
  WHEN 'green' THEN '#30a46c'
  WHEN 'teal' THEN '#12a594'
  WHEN 'blue' THEN '#3e63dd'
  WHEN 'purple' THEN '#8e4ec6'
  WHEN 'gray' THEN '#8b8d98'
  ELSE `color`
END
WHERE `color` NOT LIKE '#%';
