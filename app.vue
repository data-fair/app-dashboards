<script setup>
const application = useState('application', () => window.APPLICATION)
</script>

<template>
  <div>
    Hello !
    {{ application }}
  </div>
</template>
