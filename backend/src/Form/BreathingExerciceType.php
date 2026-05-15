<?php

namespace App\Form;

use App\Entity\BreathingExercice;
use Symfony\Component\Form\AbstractType;
use Symfony\Component\Form\Extension\Core\Type\IntegerType;
use Symfony\Component\Form\Extension\Core\Type\TextareaType;
use Symfony\Component\Form\Extension\Core\Type\TextType;
use Symfony\Component\Form\FormBuilderInterface;
use Symfony\Component\OptionsResolver\OptionsResolver;

class BreathingExerciceType extends AbstractType
{
    public function buildForm(FormBuilderInterface $builder, array $options): void
    {
        $builder
            ->add('name', TextType::class)
            ->add('duration', IntegerType::class)
            ->add('description', TextareaType::class)
            ->add('type', TextType::class)
            ->add('timeInhale', IntegerType::class)
            ->add('timeHold', IntegerType::class, ['required' => false])
            ->add('timeExhale', IntegerType::class)
            ->add('numberCycle', IntegerType::class)
        ;
    }

    public function configureOptions(OptionsResolver $resolver): void
    {
        $resolver->setDefaults([
            'data_class' => BreathingExercice::class,
        ]);
    }
}
